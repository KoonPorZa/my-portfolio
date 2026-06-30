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
import { tripGpsRoutes } from "./modules/trip-gps/trip-gps.routes";
import { TripGpsService } from "./modules/trip-gps/trip-gps.service";
import { buildCorsOptions } from "./plugins/cors";
import { rateLimitOptions } from "./plugins/rate-limit";
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
    trustProxy: true,
  });
  const repo = options.repo ?? createTripGpsRepo(env);
  const service = new TripGpsService(repo, env, options.nowMs);

  app.addHook("onRequest", async (request, reply) => {
    if (request.url.startsWith("/api/trips/")) {
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

    reply.code(404).send(errorBody("not_found", "Not found."));
  });

  registerRequestId(app);
  void app.register(sensible);
  void app.register(cors, buildCorsOptions(env));
  void app.register(helmet, helmetOptions);
  void app.register(rateLimit, rateLimitOptions);
  void app.register(healthRoutes);
  void app.register(tripGpsRoutes, { service });

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

  if (error.validation) {
    reply
      .code(400)
      .send(errorBody("invalid_payload", "Invalid location payload."));
    return;
  }

  if (isApiError(error)) {
    reply.code(error.statusCode).send(errorBody(error.code, error.message));
    return;
  }

  if (error.statusCode === 429) {
    reply.code(429).send(errorBody("rate_limited", "Too many requests."));
    return;
  }

  request.log.error({ err: error }, "Unhandled request error");
  reply
    .code(error.statusCode && error.statusCode >= 400 ? error.statusCode : 500)
    .send(errorBody("internal_error", "Internal server error."));
}

function setNoStoreHeaders(reply: FastifyReply): void {
  reply.header("Cache-Control", "no-store");
  reply.header("CDN-Cache-Control", "no-store");
}
