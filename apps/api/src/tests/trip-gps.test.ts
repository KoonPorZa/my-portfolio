import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildApp } from "../app";
import { readServerEnv } from "../config/env";
import {
  freshnessFor,
  OFFLINE_AFTER_MS,
  parseLocationPayload,
  STALE_AFTER_MS,
  TRIP_001_STOP_COORDS,
} from "../modules/trip-gps/trip-gps.service";
import { hashToken, verifyToken } from "../modules/trip-gps/trip-gps.tokens";
import type {
  CreateSessionResponse,
  LocationPayload,
  ProgressResponse,
  ViewerLatestResponse,
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
    expect(body.track).toEqual([
      expect.objectContaining({
        seq: 1,
        lat: 13.5361776,
        lng: 100.2209807,
        accuracyM: 24,
      }),
    ]);
    expect(body.stopArrivals).toEqual([
      {
        index: 9,
        arrivedAt: new Date(BASE_NOW).toISOString(),
        source: "auto",
      },
    ]);
  });

  it("returns the uploaded track points in seq order for viewers", async () => {
    let now = BASE_NOW;
    app = await makeApp(() => now);
    const session = await startSession(app);

    expect((await uploadLocation(app, session, "start", 1)).statusCode).toBe(200);

    now = BASE_NOW + 60_000;

    expect(
      (
        await uploadLocation(app, session, "manual", 2, {
          lat: 13.55,
          lng: 100.24,
          clientTs: new Date(now).toISOString(),
        })
      ).statusCode
    ).toBe(200);

    const viewerBody = await getViewerLatest(app, session);

    expect(viewerBody.track.map((point) => point.seq)).toEqual([1, 2]);
    expect(viewerBody.track.at(-1)).toMatchObject({
      seq: 2,
      lat: 13.55,
      lng: 100.24,
    });
  });

  it("auto-stamps a nearby stop once on owner uploads", async () => {
    let now = BASE_NOW;
    app = await makeApp(() => now);
    const session = await startSession(app);
    const firstArrivalTs = new Date(BASE_NOW).toISOString();

    expect(
      (
        await uploadLocation(app, session, "start", 1, stopPoint(0))
      ).statusCode
    ).toBe(200);

    let viewerBody = await getViewerLatest(app, session);
    expect(viewerBody.stopArrivals).toEqual([
      {
        index: 0,
        arrivedAt: firstArrivalTs,
        source: "auto",
      },
    ]);

    now = BASE_NOW + 60_000;

    expect(
      (
        await uploadLocation(app, session, "manual", 2, stopPoint(0))
      ).statusCode
    ).toBe(200);

    viewerBody = await getViewerLatest(app, session);
    expect(viewerBody.stopArrivals).toEqual([
      {
        index: 0,
        arrivedAt: firstArrivalTs,
        source: "auto",
      },
    ]);
  });

  it("lets manual progress set override an auto arrival", async () => {
    app = await makeApp();
    const session = await startSession(app);
    const manualArrivedAt = "2026-06-28T11:15:00.000Z";

    expect(
      (
        await uploadLocation(app, session, "start", 1, stopPoint(0))
      ).statusCode
    ).toBe(200);

    const progressResponse = await updateProgress(app, session, {
      stopIndex: 0,
      arrivedAt: manualArrivedAt,
      action: "set",
    });

    expect(progressResponse.statusCode).toBe(200);
    expect(progressResponse.headers["cache-control"]).toBe("no-store");
    expect(progressResponse.json<ProgressResponse>()).toEqual({
      ok: true,
      stopArrivals: [
        {
          index: 0,
          arrivedAt: manualArrivedAt,
          source: "manual",
        },
      ],
    });
  });

  it("clears a stop arrival through the progress endpoint", async () => {
    app = await makeApp();
    const session = await startSession(app);

    expect(
      (
        await updateProgress(app, session, {
          stopIndex: 0,
          arrivedAt: "2026-06-28T11:15:00.000Z",
          action: "set",
        })
      ).statusCode
    ).toBe(200);

    const clearResponse = await updateProgress(app, session, {
      stopIndex: 0,
      action: "clear",
    });

    expect(clearResponse.statusCode).toBe(200);
    expect(clearResponse.json<ProgressResponse>()).toEqual({
      ok: true,
      stopArrivals: [],
    });
  });

  it("does not stamp a stop for an out-of-range upload", async () => {
    app = await makeApp();
    const session = await startSession(app);

    expect(
      (
        await uploadLocation(app, session, "start", 1, {
          lat: 0,
          lng: 0,
        })
      ).statusCode
    ).toBe(200);

    const viewerBody = await getViewerLatest(app, session);
    expect(viewerBody.stopArrivals).toEqual([]);
  });

  it("includes stopArrivals in viewer latest responses", async () => {
    app = await makeApp();
    const session = await startSession(app);
    const arrivedAt = "2026-06-28T11:15:00.000Z";

    expect(
      (
        await updateProgress(app, session, {
          stopIndex: 1,
          arrivedAt,
          action: "set",
        })
      ).statusCode
    ).toBe(200);

    const viewerBody = await getViewerLatest(app, session);
    expect(viewerBody).toMatchObject({
      viewerState: "waiting-first-gps",
      latest: null,
      stopArrivals: [
        {
          index: 1,
          arrivedAt,
          source: "manual",
        },
      ],
    });
  });

  it("validates progress token, trip id, and stop index range", async () => {
    app = await makeApp();
    const session = await startSession(app);
    const payload = {
      stopIndex: 0,
      arrivedAt: "2026-06-28T11:15:00.000Z",
      action: "set",
    };

    const invalidTokenResponse = await app.inject({
      method: "POST",
      url: "/api/trips/001/progress",
      headers: {
        authorization: "Bearer bad-token",
      },
      payload,
    });
    const missingTripResponse = await app.inject({
      method: "POST",
      url: "/api/trips/999/progress",
      headers: {
        authorization: `Bearer ${session.ownerToken}`,
      },
      payload,
    });
    const outOfRangeResponse = await app.inject({
      method: "POST",
      url: "/api/trips/001/progress",
      headers: {
        authorization: `Bearer ${session.ownerToken}`,
      },
      payload: {
        ...payload,
        stopIndex: TRIP_001_STOP_COORDS.length,
      },
    });

    expect(invalidTokenResponse.statusCode).toBe(401);
    expect(missingTripResponse.statusCode).toBe(404);
    expect(outOfRangeResponse.statusCode).toBe(400);
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
    TRIP_GPS_OWNER_CODE: OWNER_CODE,
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
  seq = 1,
  overrides: Partial<LocationPayload> = {}
) {
  return fastify.inject({
    method: "POST",
    url: "/api/trips/001/location",
    headers: {
      authorization: `Bearer ${session.ownerToken}`,
    },
    payload: {
      ...makeLocationPayload(session.session.id, seq, reason),
      ...overrides,
    },
  });
}

async function updateProgress(
  fastify: FastifyInstance,
  session: CreateSessionResponse,
  payload: {
    stopIndex: number;
    arrivedAt?: string | null;
    action?: "set" | "clear";
  }
) {
  return fastify.inject({
    method: "POST",
    url: "/api/trips/001/progress",
    headers: {
      authorization: `Bearer ${session.ownerToken}`,
    },
    payload,
  });
}

async function getViewerLatest(
  fastify: FastifyInstance,
  session: CreateSessionResponse
): Promise<ViewerLatestResponse> {
  const response = await fastify.inject({
    method: "GET",
    url: `/api/trips/001/location?t=${encodeURIComponent(session.viewerToken)}`,
  });

  expect(response.statusCode).toBe(200);

  return response.json<ViewerLatestResponse>();
}

function stopPoint(index: number): Pick<LocationPayload, "lat" | "lng"> {
  const coords = TRIP_001_STOP_COORDS[index];

  if (!coords) {
    throw new Error(`Missing test stop coordinate at index ${index}`);
  }

  return {
    lat: coords[0],
    lng: coords[1],
  };
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
