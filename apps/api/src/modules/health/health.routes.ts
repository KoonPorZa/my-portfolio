import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";

import type { ServerEnv } from "../../config/env";
import type { TripGpsRepo } from "../trip-gps/trip-gps.repo";

// Readiness store-probe budget. If the store doesn't answer in time we report
// 503 rather than hanging the health check.
const READY_PROBE_TIMEOUT_MS = 2_000;

const HealthResponseSchema = Type.Object({
  status: Type.Literal("ok"),
  service: Type.String(),
  version: Type.String(),
  commit: Type.String(),
  uptimeSeconds: Type.Number(),
});

const VersionResponseSchema = Type.Object({
  service: Type.String(),
  version: Type.String(),
  commit: Type.String(),
  startedAt: Type.String(),
  uptimeSeconds: Type.Number(),
});

const ReadyResponseSchema = Type.Object({
  status: Type.Union([Type.Literal("ready"), Type.Literal("unavailable")]),
  store: Type.String(),
  latencyMs: Type.Number(),
});

export type HealthRouteOptions = {
  env: ServerEnv;
  repo: TripGpsRepo;
  startedAtMs: number;
  now: () => number;
};

export async function healthRoutes(
  fastify: FastifyInstance,
  options: HealthRouteOptions
) {
  const { env, repo, startedAtMs } = options;
  const now = options.now;
  const service = "trip-gps-api";
  const version = process.env.npm_package_version ?? "";
  const commit = env.gitCommitSha;
  const store = env.selectedTripGpsStore;

  const uptimeSeconds = (): number =>
    Math.max(0, Math.round((now() - startedAtMs) / 1_000));

  // Liveness — cheap, no dependencies. Point the platform's restart probe here.
  fastify.get(
    "/health",
    {
      config: { rateLimit: false },
      schema: { response: { 200: HealthResponseSchema } },
    },
    async () => ({
      status: "ok" as const,
      service,
      version,
      commit,
      uptimeSeconds: uptimeSeconds(),
    })
  );

  // Build/version info — ties a running instance to a git commit.
  fastify.get(
    "/version",
    {
      config: { rateLimit: false },
      schema: { response: { 200: VersionResponseSchema } },
    },
    async () => ({
      service,
      version,
      commit,
      startedAt: new Date(startedAtMs).toISOString(),
      uptimeSeconds: uptimeSeconds(),
    })
  );

  // Readiness — probes the store. Point uptime/traffic gating here (not /health).
  fastify.get(
    "/ready",
    {
      config: { rateLimit: false },
      schema: {
        response: {
          200: ReadyResponseSchema,
          503: ReadyResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const start = now();

      try {
        await withTimeout(repo.ping(), READY_PROBE_TIMEOUT_MS);
        return {
          status: "ready" as const,
          store,
          latencyMs: Math.max(0, now() - start),
        };
      } catch (error) {
        fastify.log.error({ err: error }, "Readiness store probe failed");
        reply.code(503);
        return {
          status: "unavailable" as const,
          store,
          latencyMs: Math.max(0, now() - start),
        };
      }
    }
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Store probe timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
