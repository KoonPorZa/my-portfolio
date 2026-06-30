import type { FastifyInstance } from "fastify";

import type { SessionEndAction } from "./trip-gps.types";
import type { TripGpsService } from "./trip-gps.service";
import { readBearerToken } from "./trip-gps.service";
import {
  CreateSessionResponseSchema,
  ErrorResponseSchema,
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

type TripGpsRouteOptions = {
  service: TripGpsService;
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

const OWNER_RATE_LIMIT = {
  max: 20,
  timeWindow: "1 minute",
  groupId: "trip-gps-owner",
};

const VIEWER_RATE_LIMIT = {
  max: 60,
  timeWindow: "1 minute",
  groupId: "trip-gps-viewer",
};

export async function tripGpsRoutes(
  fastify: FastifyInstance,
  options: TripGpsRouteOptions
) {
  fastify.post<{
    Params: TripParams;
    Body: unknown;
  }>(
    "/api/trips/:tripId/location",
    {
      config: {
        rateLimit: OWNER_RATE_LIMIT,
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
        rateLimit: VIEWER_RATE_LIMIT,
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
        rateLimit: OWNER_RATE_LIMIT,
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
      return options.service.startSession(
        request.params.tripId,
        normalizeOptionalString(request.body.code)
      );
    }
  );

  fastify.post<{
    Params: TripParams;
    Body: StopSessionBody;
  }>(
    "/api/trips/:tripId/session/stop",
    {
      config: {
        rateLimit: OWNER_RATE_LIMIT,
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

  fastify.post<{
    Params: TripParams;
    Body: ProgressBody;
  }>(
    "/api/trips/:tripId/progress",
    {
      config: {
        rateLimit: OWNER_RATE_LIMIT,
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

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
