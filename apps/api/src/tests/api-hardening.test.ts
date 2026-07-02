import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildApp } from "../app";
import { readServerEnv } from "../config/env";
import { maskUrlToken } from "../lib/logger";
import { OwnerCodeThrottle } from "../modules/trip-gps/owner-code-throttle";
import type { CreateSessionResponse } from "../modules/trip-gps/trip-gps.types";

const OWNER_CODE = "owner-secret";
const BASE_NOW = Date.parse("2026-06-28T10:29:42.120Z");

let app: FastifyInstance | null = null;

afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
});

async function makeApp(
  overrides: Record<string, string> = {},
  nowMs: () => number = () => BASE_NOW
): Promise<FastifyInstance> {
  const env = readServerEnv({
    NODE_ENV: "test",
    PORT: "3000",
    CORS_ORIGINS: "http://localhost:3000",
    TRIP_GPS_ENABLED: "1",
    TRIP_GPS_STORE: "memory",
    TRIP_GPS_OWNER_CODE: OWNER_CODE,
    ...overrides,
  });
  const testApp = buildApp({ env, nowMs, logger: false });

  await testApp.ready();

  return testApp;
}

function startSession(
  instance: FastifyInstance,
  code: string,
  ip: string
) {
  return instance.inject({
    method: "POST",
    url: "/api/trips/001/session/start",
    headers: { "x-forwarded-for": ip },
    payload: { code },
  });
}

describe("Phase 14 — owner-code brute-force guard", () => {
  it("locks an IP after repeated wrong codes and answers a generic 401", async () => {
    app = await makeApp({
      OWNER_CODE_MAX_ATTEMPTS: "3",
      // Keep the per-route limiter out of the way so we isolate the lock.
      RATE_LIMIT_SESSION_START_MAX: "100",
    });
    const attacker = "198.51.100.7";

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const wrong = await startSession(app, "nope", attacker);
      expect(wrong.statusCode).toBe(401);
      expect(wrong.json()).toMatchObject({ error: "invalid_owner_code" });
    }

    // Now locked: even the CORRECT code is rejected with the same generic 401.
    const correctButLocked = await startSession(app, OWNER_CODE, attacker);
    expect(correctButLocked.statusCode).toBe(401);
    expect(correctButLocked.json()).toMatchObject({ error: "invalid_owner_code" });

    // A different client IP is unaffected and can still start a session.
    const other = await startSession(app, OWNER_CODE, "203.0.113.99");
    expect(other.statusCode).toBe(200);
  });

  it("does not lock on a genuinely correct first code", async () => {
    app = await makeApp({ OWNER_CODE_MAX_ATTEMPTS: "3" });

    const first = await startSession(app, OWNER_CODE, "198.51.100.8");
    expect(first.statusCode).toBe(200);

    const second = await startSession(app, OWNER_CODE, "198.51.100.8");
    expect(second.statusCode).toBe(200);
  });

  it("keeps viewer reads working even after the owner-code IP is locked", async () => {
    app = await makeApp({
      OWNER_CODE_MAX_ATTEMPTS: "2",
      RATE_LIMIT_SESSION_START_MAX: "100",
    });
    const ip = "198.51.100.20";

    const started = await startSession(app, OWNER_CODE, ip);
    expect(started.statusCode).toBe(200);
    const { viewerToken } = started.json<CreateSessionResponse>();

    // Lock the IP via wrong owner codes.
    await startSession(app, "nope", ip);
    await startSession(app, "nope", ip);
    expect((await startSession(app, OWNER_CODE, ip)).statusCode).toBe(401);

    // The viewer read from the SAME IP is unaffected by the owner-code lock.
    const viewer = await app.inject({
      method: "GET",
      url: `/api/trips/001/location?t=${encodeURIComponent(viewerToken)}`,
      headers: { "x-forwarded-for": ip },
    });
    expect(viewer.statusCode).toBe(200);
  });
});

describe("Phase 14 — body + content-type guards", () => {
  it("rejects an oversized body with 413 before touching the store", async () => {
    app = await makeApp({ BODY_LIMIT_BYTES: "64" });

    const response = await app.inject({
      method: "POST",
      url: "/api/trips/001/location",
      headers: { "content-type": "application/json" },
      payload: { code: "x".repeat(200) },
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ error: "payload_too_large" });
  });

  it("rejects an unsupported content type with 415", async () => {
    app = await makeApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/trips/001/location",
      headers: { "content-type": "application/xml" },
      payload: "<x/>",
    });

    expect(response.statusCode).toBe(415);
    expect(response.json()).toMatchObject({ error: "unsupported_media_type" });
  });
});

describe("Phase 14 — dedicated session/start rate limit", () => {
  it("throttles session/start tighter than the broad owner limit", async () => {
    app = await makeApp({
      RATE_LIMIT_SESSION_START_MAX: "2",
      // High attempt cap so the lock doesn't fire first — we want the limiter.
      OWNER_CODE_MAX_ATTEMPTS: "100",
    });
    const ip = "198.51.100.30";

    expect((await startSession(app, "nope", ip)).statusCode).toBe(401);
    expect((await startSession(app, "nope", ip)).statusCode).toBe(401);

    const limited = await startSession(app, "nope", ip);
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ error: "rate_limited" });
    expect(limited.headers["retry-after"]).toBeTruthy();
  });
});

describe("Phase 16 — log + error hygiene", () => {
  it("masks the viewer token in logged URLs", () => {
    expect(maskUrlToken("/api/trips/001/location?t=secret-token")).toBe(
      "/api/trips/001/location?t=[redacted]"
    );
    expect(maskUrlToken("/api/trips/001/location?t=secret&x=1")).toBe(
      "/api/trips/001/location?t=[redacted]&x=1"
    );
    expect(maskUrlToken("/health")).toBe("/health");
  });

  it("includes the request id in error response bodies", async () => {
    app = await makeApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/trips/001/location",
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.requestId).toBeTruthy();
    expect(response.headers["x-request-id"]).toBe(body.requestId);
  });
});

describe("Phase 16 — health, ready, version", () => {
  it("serves liveness, readiness, and version", async () => {
    app = await makeApp({ GIT_SHA: "abc1234" });

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({
      status: "ok",
      service: "trip-gps-api",
      commit: "abc1234",
    });

    const ready = await app.inject({ method: "GET", url: "/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ status: "ready", store: "memory" });

    const version = await app.inject({ method: "GET", url: "/version" });
    expect(version.statusCode).toBe(200);
    expect(version.json()).toMatchObject({ commit: "abc1234" });
  });
});

describe("Phase 14 — owner-code throttle unit", () => {
  it("locks after the attempt cap and clears on success", () => {
    let now = 0;
    const throttle = new OwnerCodeThrottle({
      maxAttempts: 3,
      lockMs: 1_000,
      now: () => now,
    });

    expect(throttle.isLocked("ip")).toBe(false);
    throttle.recordFailure("ip");
    throttle.recordFailure("ip");
    expect(throttle.isLocked("ip")).toBe(false);
    throttle.recordFailure("ip");
    expect(throttle.isLocked("ip")).toBe(true);

    // Lock expires after lockMs.
    now = 1_001;
    expect(throttle.isLocked("ip")).toBe(false);

    // Success clears any partial failures.
    throttle.recordFailure("ip");
    throttle.recordSuccess("ip");
    expect(throttle.isLocked("ip")).toBe(false);
  });
});
