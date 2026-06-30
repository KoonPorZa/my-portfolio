import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildApp } from "../app";
import { readServerEnv } from "../config/env";
import {
  freshnessFor,
  OFFLINE_AFTER_MS,
  parseLocationPayload,
  STALE_AFTER_MS,
} from "../modules/trip-gps/trip-gps.service";
import { hashToken, verifyToken } from "../modules/trip-gps/trip-gps.tokens";
import type {
  CreateSessionResponse,
  LocationPayload,
} from "../modules/trip-gps/trip-gps.types";

const OWNER_CODE = "owner-secret";
const BASE_NOW = Date.parse("2026-06-28T10:29:42.120Z");

let app: FastifyInstance | null = null;

afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
});

describe("Trip GPS tokens", () => {
  it("hashes tokens with SHA-256 hex and verifies with constant-length compare", () => {
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    expect(verifyToken("abc", hashToken("abc"))).toBe(true);
    expect(verifyToken("abc", hashToken("def"))).toBe(false);
    expect(verifyToken("abc", "not-a-hex-digest")).toBe(false);
    expect(verifyToken("", hashToken("abc"))).toBe(false);
  });
});

describe("Trip GPS payload and freshness rules", () => {
  it("sanitizes valid uploads and rejects bad accuracy", () => {
    const payload = makeLocationPayload("session-1");

    expect(parseLocationPayload(payload)).toMatchObject({
      sessionId: "session-1",
      lat: 13.5361776,
      lng: 100.2209807,
      accuracyM: 24,
      reason: "start",
    });
    expect(
      parseLocationPayload({
        ...payload,
        accuracyM: 251,
      })
    ).toBeNull();
  });

  it("maps latest-point age to fresh, stale, and offline", () => {
    expect(freshnessFor(0)).toBe("fresh");
    expect(freshnessFor(STALE_AFTER_MS)).toBe("fresh");
    expect(freshnessFor(STALE_AFTER_MS + 1)).toBe("stale");
    expect(freshnessFor(OFFLINE_AFTER_MS + 1)).toBe("offline");
  });
});

describe("Trip GPS Fastify routes", () => {
  it("applies root security, CORS, request id, and route rate limits", async () => {
    app = await makeApp();
    const origin = "http://localhost:3000";

    const healthResponse = await app.inject({
      method: "GET",
      url: "/health",
      headers: {
        origin,
      },
    });

    expect(healthResponse.statusCode).toBe(200);
    expect(healthResponse.headers["x-content-type-options"]).toBe("nosniff");
    expect(healthResponse.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(healthResponse.headers["x-request-id"]).toBeTruthy();

    const startResponse = await app.inject({
      method: "POST",
      url: "/api/trips/001/session/start",
      headers: {
        origin,
      },
      payload: {
        code: OWNER_CODE,
      },
    });

    expect(startResponse.statusCode).toBe(200);
    expect(startResponse.headers["access-control-allow-origin"]).toBe(origin);

    const session = startResponse.json<CreateSessionResponse>();
    let viewerResponse = await app.inject({
      method: "GET",
      url: `/api/trips/001/location?t=${encodeURIComponent(session.viewerToken)}`,
      headers: {
        origin,
        "x-forwarded-for": "203.0.113.10",
      },
    });

    expect(viewerResponse.statusCode).toBe(200);
    expect(viewerResponse.headers["access-control-allow-origin"]).toBe(origin);

    for (let index = 0; index < 60; index += 1) {
      viewerResponse = await app.inject({
        method: "GET",
        url: `/api/trips/001/location?t=${encodeURIComponent(session.viewerToken)}`,
        headers: {
          "x-forwarded-for": "203.0.113.10",
        },
      });
    }

    expect(viewerResponse.statusCode).toBe(429);
    expect(viewerResponse.json()).toMatchObject({
      error: "rate_limited",
    });
  });

  it("starts a session, accepts owner upload, and serves viewer latest", async () => {
    app = await makeApp();
    const session = await startSession(app);
    const uploadResponse = await uploadLocation(app, session, "start");

    expect(uploadResponse.statusCode).toBe(200);
    expect(uploadResponse.headers["cache-control"]).toBe("no-store");
    expect(uploadResponse.headers["cdn-cache-control"]).toBe("no-store");
    expect(session.viewerLink).toBe(`/trip/001/live?t=${session.viewerToken}`);

    const viewerResponse = await app.inject({
      method: "GET",
      url: `/api/trips/001/location?t=${encodeURIComponent(session.viewerToken)}`,
    });
    const body = viewerResponse.json();

    expect(viewerResponse.statusCode).toBe(200);
    expect(body).toMatchObject({
      status: "active",
      freshness: "fresh",
      viewerState: "fresh",
      nextPollMs: 60_000,
      message: "Latest location is fresh.",
    });
    expect(body.latest).toMatchObject({
      lat: 13.5361776,
      lng: 100.2209807,
      accuracyM: 24,
    });
  });

  it("returns 401 for missing or invalid viewer tokens and 403 after revoke", async () => {
    app = await makeApp();

    const missingResponse = await app.inject({
      method: "GET",
      url: "/api/trips/001/location",
    });
    const invalidResponse = await app.inject({
      method: "GET",
      url: "/api/trips/001/location?t=bad-token",
    });

    expect(missingResponse.statusCode).toBe(401);
    expect(invalidResponse.statusCode).toBe(401);

    const session = await startSession(app);
    const revokeResponse = await app.inject({
      method: "POST",
      url: "/api/trips/001/session/stop",
      headers: {
        authorization: `Bearer ${session.ownerToken}`,
      },
      payload: {
        sessionId: session.session.id,
        action: "revoke",
      },
    });
    const revokedViewerResponse = await app.inject({
      method: "GET",
      url: `/api/trips/001/location?t=${encodeURIComponent(session.viewerToken)}`,
    });

    expect(revokeResponse.statusCode).toBe(200);
    expect(revokedViewerResponse.statusCode).toBe(403);
  });

  it("rejects malformed payloads and too-frequent scheduled uploads", async () => {
    app = await makeApp();
    const session = await startSession(app);

    expect((await uploadLocation(app, session, "start")).statusCode).toBe(200);

    const malformedResponse = await app.inject({
      method: "POST",
      url: "/api/trips/001/location",
      headers: {
        authorization: `Bearer ${session.ownerToken}`,
      },
      payload: {
        ...makeLocationPayload(session.session.id, 2, "manual"),
        accuracyM: 999,
      },
    });
    const tooFrequentResponse = await uploadLocation(app, session, "scheduled", 3);

    expect(malformedResponse.statusCode).toBe(400);
    expect(malformedResponse.json()).toMatchObject({
      error: "invalid_payload",
    });
    expect(tooFrequentResponse.statusCode).toBe(429);
    expect(tooFrequentResponse.json()).toMatchObject({
      error: "too_frequent",
    });
  });

  it("does not let a viewer token write owner location updates", async () => {
    app = await makeApp();
    const session = await startSession(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/trips/001/location",
      headers: {
        authorization: `Bearer ${session.viewerToken}`,
      },
      payload: makeLocationPayload(session.session.id),
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 401 for uploads when the owner token lookup fails", async () => {
    app = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/trips/001/location",
      headers: {
        authorization: "Bearer bad-token",
      },
      payload: makeLocationPayload("unknown-session"),
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: "invalid_token",
    });
  });
});

async function makeApp(nowMs = () => BASE_NOW): Promise<FastifyInstance> {
  const env = readServerEnv({
    NODE_ENV: "test",
    PORT: "3000",
    CORS_ORIGINS: "http://localhost:3000",
    TRIP_GPS_ENABLED: "1",
    TRIP_GPS_STORE: "memory",
    TRIP_GPS_OWNER_CODE_HASH: hashToken(OWNER_CODE),
  });
  const testApp = buildApp({
    env,
    nowMs,
    logger: false,
  });

  await testApp.ready();

  return testApp;
}

async function startSession(
  fastify: FastifyInstance
): Promise<CreateSessionResponse> {
  const response = await fastify.inject({
    method: "POST",
    url: "/api/trips/001/session/start",
    payload: {
      code: OWNER_CODE,
    },
  });

  expect(response.statusCode).toBe(200);

  return response.json<CreateSessionResponse>();
}

async function uploadLocation(
  fastify: FastifyInstance,
  session: CreateSessionResponse,
  reason: LocationPayload["reason"],
  seq = 1
) {
  return fastify.inject({
    method: "POST",
    url: "/api/trips/001/location",
    headers: {
      authorization: `Bearer ${session.ownerToken}`,
    },
    payload: makeLocationPayload(session.session.id, seq, reason),
  });
}

function makeLocationPayload(
  sessionId: string,
  seq = 1,
  reason: LocationPayload["reason"] = "start"
): LocationPayload {
  return {
    sessionId,
    seq,
    lat: 13.5361776,
    lng: 100.2209807,
    accuracyM: 24,
    speedMps: 18.4,
    headingDeg: 12,
    clientTs: new Date(BASE_NOW).toISOString(),
    mode: "active",
    reason,
  };
}
