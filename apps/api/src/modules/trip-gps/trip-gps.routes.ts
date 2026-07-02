import type { FastifyInstance } from "fastify";

import type { ServerEnv } from "../../config/env";
import { ApiError, isApiError } from "../../lib/errors";
import type { OwnerCodeThrottle } from "./owner-code-throttle";
import type { SessionEndAction } from "./trip-gps.types";
import type { TripGpsService } from "./trip-gps.service";
import { readBearerToken } from "./trip-gps.service";
import {
  CreateSessionResponseSchema,
  ErrorResponseSchema,
  GoogleRouteResponseSchema,
  LocationPayloadSchema,
  ProgressBodySchema,
  ProgressResponseSchema,
  StartSessionBodySchema,
  StopSessionBodySchema,
  StopSessionResponseSchema,
  TripParamsSchema,
  UploadLocationResponseSchema,
  ViewerLatestResponseSchema,
  ViewerQuerySchema,
} from "./trip-gps.schema";
import type { GoogleRouteHandler } from "./google-route";

export type RouteRateLimit = {
  max: number;
  timeWindow: string;
  groupId: string;
};

export type TripGpsRateLimits = {
  owner: RouteRateLimit;
  viewer: RouteRateLimit;
  sessionStart: RouteRateLimit;
  googleRoute: RouteRateLimit;
};

export function buildTripGpsRateLimits(env: ServerEnv): TripGpsRateLimits {
  return {
    owner: {
      max: env.rateLimitOwnerMax,
      timeWindow: env.rateLimitWindow,
      groupId: "trip-gps-owner",
    },
    viewer: {
      max: env.rateLimitViewerMax,
      timeWindow: env.rateLimitWindow,
      groupId: "trip-gps-viewer",
    },
    // Owner-code entry point gets its own, tighter bucket so it can't ride the
    // broader owner-write budget while being brute-forced.
    sessionStart: {
      max: env.rateLimitSessionStartMax,
      timeWindow: env.rateLimitWindow,
      groupId: "trip-gps-session-start",
    },
    googleRoute: {
      max: env.rateLimitGoogleRouteMax,
      timeWindow: env.rateLimitWindow,
      groupId: "trip-gps-google",
    },
  };
}

type TripGpsRouteOptions = {
  service: TripGpsService;
  googleRouteHandler: GoogleRouteHandler;
  ownerCodeThrottle: OwnerCodeThrottle;
  limits: TripGpsRateLimits;
};

type TripParams = {
  tripId: string;
};

type ViewerQuery = {
  t?: string;
};

type StartSessionBody = {
  code?: string;
};

type StopSessionBody = {
  sessionId?: string;
  action?: SessionEndAction;
};

type ProgressBody = {
  stopIndex: number;
  arrivedAt?: string | null;
  action?: "set" | "clear";
};

export async function tripGpsRoutes(
  fastify: FastifyInstance,
  options: TripGpsRouteOptions
) {
  const { limits } = options;

  fastify.post<{
    Params: TripParams;
    Body: unknown;
  }>(
    "/api/trips/:tripId/location",
    {
      config: {
        rateLimit: limits.owner,
      },
      schema: {
        params: TripParamsSchema,
        body: LocationPayloadSchema,
        response: {
          200: UploadLocationResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          429: ErrorResponseSchema,
        },
      },
    },
    async (request) => {
      return options.service.uploadLocation({
        tripId: request.params.tripId,
        ownerToken: readBearerToken(firstHeader(request.headers.authorization)),
        body: request.body,
      });
    }
  );

  fastify.get<{
    Params: TripParams;
    Querystring: ViewerQuery;
  }>(
    "/api/trips/:tripId/location",
    {
      config: {
        rateLimit: limits.viewer,
      },
      schema: {
        params: TripParamsSchema,
        querystring: ViewerQuerySchema,
        response: {
          200: ViewerLatestResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          429: ErrorResponseSchema,
        },
      },
    },
    async (request) => {
      return options.service.getViewerLatest({
        tripId: request.params.tripId,
        viewerToken: normalizeOptionalString(request.query.t),
      });
    }
  );

  fastify.post<{
    Params: TripParams;
    Body: StartSessionBody;
  }>(
    "/api/trips/:tripId/session/start",
    {
      config: {
        rateLimit: limits.sessionStart,
      },
      schema: {
        params: TripParamsSchema,
        body: StartSessionBodySchema,
        response: {
          200: CreateSessionResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          429: ErrorResponseSchema,
          503: ErrorResponseSchema,
        },
      },
    },
    async (request) => {
      const ip = request.ip;

      // A locked IP and a wrong code return the exact same generic 401, so a
      // brute-forcer can't tell whether it's being throttled.
      if (options.ownerCodeThrottle.isLocked(ip)) {
        throw invalidOwnerCode();
      }

      try {
        const result = await options.service.startSession(
          request.params.tripId,
          normalizeOptionalString(request.body.code)
        );
        options.ownerCodeThrottle.recordSuccess(ip);
        return result;
      } catch (error) {
        // Only a genuinely wrong code counts toward the lock — a missing owner
        // code config (503) or any other error passes through untouched.
        if (isApiError(error) && error.code === "invalid_owner_code") {
          options.ownerCodeThrottle.recordFailure(ip);
          throw invalidOwnerCode();
        }

        throw error;
      }
    }
  );

  fastify.post<{
    Params: TripParams;
    Body: StopSessionBody;
  }>(
    "/api/trips/:tripId/session/stop",
    {
      config: {
        rateLimit: limits.owner,
      },
      schema: {
        params: TripParamsSchema,
        body: StopSessionBodySchema,
        response: {
          200: StopSessionResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          429: ErrorResponseSchema,
        },
      },
    },
    async (request) => {
      return options.service.stopSession({
        tripId: request.params.tripId,
        ownerToken: readBearerToken(firstHeader(request.headers.authorization)),
        sessionId: normalizeOptionalString(request.body.sessionId),
        action: request.body.action === "revoke" ? "revoke" : "stop",
      });
    }
  );

  fastify.get<{
    Params: TripParams;
  }>(
    "/api/trips/:tripId/google-route",
    {
      config: {
        rateLimit: limits.googleRoute,
      },
      schema: {
        params: TripParamsSchema,
        response: {
          200: GoogleRouteResponseSchema,
          429: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await options.googleRouteHandler(request.params.tripId);

      if (result.fallback) {
        // Fallback is transient (disabled / quota / upstream error) — never cache it.
        reply.header("Cache-Control", "no-store");
        reply.header("CDN-Cache-Control", "no-store");
      } else {
        // Cache the fixed planned route at a shared edge for the REMAINING TTL
        // only (never longer than the server cache; still TTL-bounded per Google
        // ToS — never a permanent artifact). Browsers don't cache it (max-age=0);
        // a shared edge (Cloudflare) does, absorbing bursts before the upstream.
        const remainingSeconds = Math.max(
          0,
          Math.floor((Date.parse(result.expiresAt) - Date.now()) / 1000)
        );
        reply.header("Cache-Control", `public, max-age=0, s-maxage=${remainingSeconds}`);
        reply.header("CDN-Cache-Control", `public, s-maxage=${remainingSeconds}`);
      }

      return result;
    }
  );

  fastify.post<{
    Params: TripParams;
    Body: ProgressBody;
  }>(
    "/api/trips/:tripId/progress",
    {
      config: {
        rateLimit: limits.owner,
      },
      schema: {
        params: TripParamsSchema,
        body: ProgressBodySchema,
        response: {
          200: ProgressResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
          429: ErrorResponseSchema,
        },
      },
    },
    async (request) => {
      return options.service.updateProgress({
        tripId: request.params.tripId,
        ownerToken: readBearerToken(firstHeader(request.headers.authorization)),
        body: request.body,
      });
    }
  );
}

function invalidOwnerCode(): ApiError {
  return new ApiError(401, "invalid_owner_code", "Invalid or missing owner code.");
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
