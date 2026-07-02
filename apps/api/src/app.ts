import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify, {
  type FastifyServerOptions,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";

import { readServerEnv, type ServerEnv } from "./config/env";
import { isApiError, errorBody } from "./lib/errors";
import { createLoggerOptions } from "./lib/logger";
import { healthRoutes } from "./modules/health/health.routes";
import {
  createTripGpsRepo,
  type TripGpsRepo,
} from "./modules/trip-gps/trip-gps.repo";
import {
  buildTripGpsRateLimits,
  tripGpsRoutes,
} from "./modules/trip-gps/trip-gps.routes";
import { TripGpsService } from "./modules/trip-gps/trip-gps.service";
import { createGoogleRouteHandler } from "./modules/trip-gps/google-route";
import { OwnerCodeThrottle } from "./modules/trip-gps/owner-code-throttle";
import { buildCorsOptions } from "./plugins/cors";
import { buildRateLimitOptions } from "./plugins/rate-limit";
import { registerRequestId } from "./plugins/request-id";
import { helmetOptions } from "./plugins/security";

export type BuildAppOptions = {
  env?: ServerEnv;
  repo?: TripGpsRepo;
  nowMs?: () => number;
  logger?: FastifyServerOptions["logger"];
};

type FastifyErrorWithStatus = Error & {
  statusCode?: number;
  validation?: unknown;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const env = options.env ?? readServerEnv();
  const app = Fastify({
    logger: options.logger ?? createLoggerOptions(env),
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "requestId",
    // Trust a fixed number of proxy hops (default 1 = Railway) so request.ip is
    // the real client, not a spoofable x-forwarded-for. See config/env.ts.
    trustProxy: env.trustProxy,
    // Reject oversized bodies with 413 before they reach a handler/store.
    bodyLimit: env.bodyLimitBytes,
  });
  const nowMs = options.nowMs ?? (() => Date.now());
  const startedAtMs = nowMs();
  const repo = options.repo ?? createTripGpsRepo(env);
  const service = new TripGpsService(repo, env, options.nowMs);
  const googleRouteHandler = createGoogleRouteHandler(env, app.log);
  const ownerCodeThrottle = new OwnerCodeThrottle({
    maxAttempts: env.ownerCodeMaxAttempts,
    lockMs: env.ownerCodeLockMs,
    now: options.nowMs,
  });

  app.addHook("onRequest", async (request, reply) => {
    // Location/session/viewer responses must never be cached. The planned
    // Google route (/google-route) is the exception: it is non-token, identical
    // for everyone, and cost-sensitive — its handler sets a TTL-bounded
    // s-maxage so a shared edge (Cloudflare) can absorb bursts instead of
    // fanning out to the billed upstream. So skip the blanket no-store there.
    if (request.url.startsWith("/api/trips/") && !isGoogleRoutePath(request.url)) {
      setNoStoreHeaders(reply);
    }
  });

  app.setErrorHandler((error, request, reply) => {
    handleError(error as FastifyErrorWithStatus, request, reply);
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/trips/")) {
      setNoStoreHeaders(reply);
    }

    reply
      .code(404)
      .send(errorBody("not_found", "Not found.", String(request.id)));
  });

  registerRequestId(app);
  void app.register(sensible);
  void app.register(cors, buildCorsOptions(env));
  void app.register(helmet, helmetOptions);
  void app.register(rateLimit, buildRateLimitOptions(env));
  void app.register(healthRoutes, { env, repo, startedAtMs, now: nowMs });
  void app.register(tripGpsRoutes, {
    service,
    googleRouteHandler,
    ownerCodeThrottle,
    limits: buildTripGpsRateLimits(env),
  });

  return app;
}

function handleError(
  error: FastifyErrorWithStatus,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  if (request.url.startsWith("/api/trips/")) {
    setNoStoreHeaders(reply);
  }

  const requestId = String(request.id);

  if (error.validation) {
    reply
      .code(400)
      .send(
        errorBody("invalid_payload", "Invalid location payload.", requestId)
      );
    return;
  }

  if (isApiError(error)) {
    reply
      .code(error.statusCode)
      .send(errorBody(error.code, error.message, requestId));
    return;
  }

  if (error.statusCode === 429) {
    reply
      .code(429)
      .send(errorBody("rate_limited", "Too many requests.", requestId));
    return;
  }

  // Oversized body / wrong content-type are rejected by Fastify's content-type
  // parser (Phase 14) — surface a clean code instead of a generic 500.
  if (error.statusCode === 413) {
    reply
      .code(413)
      .send(errorBody("payload_too_large", "Request body is too large.", requestId));
    return;
  }

  if (error.statusCode === 415) {
    reply
      .code(415)
      .send(
        errorBody(
          "unsupported_media_type",
          "Unsupported content type.",
          requestId
        )
      );
    return;
  }

  request.log.error({ err: error }, "Unhandled request error");
  reply
    .code(error.statusCode && error.statusCode >= 400 ? error.statusCode : 500)
    .send(errorBody("internal_error", "Internal server error.", requestId));
}

function setNoStoreHeaders(reply: FastifyReply): void {
  reply.header("Cache-Control", "no-store");
  reply.header("CDN-Cache-Control", "no-store");
}

function isGoogleRoutePath(url: string): boolean {
  // Path is /api/trips/:tripId/google-route (no query string on this route).
  const path = url.split("?")[0] ?? url;
  return path.endsWith("/google-route");
}
