import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildApp } from "../app";
import { readServerEnv } from "../config/env";
import { createGoogleRouteHandler } from "../modules/trip-gps/google-route";

const OWNER_CODE = "owner-secret";

let app: FastifyInstance | null = null;

afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }

  vi.restoreAllMocks();
});

async function makeApp(
  envOverrides: Record<string, string> = {}
): Promise<FastifyInstance> {
  const env = readServerEnv({
    NODE_ENV: "test",
    PORT: "3000",
    CORS_ORIGINS: "http://localhost:3000",
    TRIP_GPS_ENABLED: "1",
    TRIP_GPS_STORE: "memory",
    TRIP_GPS_OWNER_CODE: OWNER_CODE,
    ...envOverrides,
  });
  const testApp = buildApp({ env, logger: false });

  await testApp.ready();
  return testApp;
}

function makeFetchSuccess(
  encodedPolyline = "abc123polyline",
  distanceMeters = 1500_000,
  duration = "44231s"
): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      routes: [
        {
          polyline: { encodedPolyline },
          distanceMeters,
          duration,
        },
      ],
    }),
  }) as unknown as typeof globalThis.fetch;
}

describe("GET /api/trips/001/google-route", () => {
  it("returns fallback:disabled when GOOGLE_MAPS_ROUTES_API_KEY is not set", async () => {
    app = await makeApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/trips/001/google-route",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ fallback: true, reason: "disabled" });
  });

  it("returns success with encodedPolyline on a mocked upstream hit", async () => {
    const mockFetch = makeFetchSuccess();
    vi.stubGlobal("fetch", mockFetch);

    app = await makeApp({ GOOGLE_MAPS_ROUTES_API_KEY: "fake-key" });

    const response = await app.inject({
      method: "GET",
      url: "/api/trips/001/google-route",
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();

    expect(body.fallback).toBe(false);
    expect(body.encodedPolyline).toBe("abc123polyline");
    expect(body.distanceMeters).toBe(1_500_000);
    expect(body.durationSeconds).toBe(44_231);
    expect(body.source).toBe("google");
    expect(typeof body.cachedAt).toBe("string");
    expect(typeof body.expiresAt).toBe("string");
  });

  it("serves the same cached data on second request without calling fetch again", async () => {
    const mockFetch = makeFetchSuccess();
    vi.stubGlobal("fetch", mockFetch);

    app = await makeApp({ GOOGLE_MAPS_ROUTES_API_KEY: "fake-key" });

    const first = await app.inject({
      method: "GET",
      url: "/api/trips/001/google-route",
    });
    const second = await app.inject({
      method: "GET",
      url: "/api/trips/001/google-route",
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json().encodedPolyline).toBe(second.json().encodedPolyline);
    expect(first.json().cachedAt).toBe(second.json().cachedAt);

    // fetch must have been called exactly once — second request came from cache
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns fallback:quota when daily quota is 0", async () => {
    // quota=0 means no upstream calls are ever permitted
    const mockFetch = vi.fn() as unknown as typeof globalThis.fetch;
    vi.stubGlobal("fetch", mockFetch);

    app = await makeApp({
      GOOGLE_MAPS_ROUTES_API_KEY: "fake-key",
      TRIP_GOOGLE_ROUTE_DAILY_QUOTA: "0",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/trips/001/google-route",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ fallback: true, reason: "quota" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("edge-caches the planned route (s-maxage) but never caches a fallback", async () => {
    vi.stubGlobal("fetch", makeFetchSuccess());
    app = await makeApp({ GOOGLE_MAPS_ROUTES_API_KEY: "fake-key" });

    const ok = await app.inject({ method: "GET", url: "/api/trips/001/google-route" });
    expect(ok.statusCode).toBe(200);
    expect(String(ok.headers["cdn-cache-control"])).toContain("s-maxage=");
    expect(String(ok.headers["cache-control"])).toContain("s-maxage=");

    await app.close();

    // No key -> fallback -> must be no-store (transient, never cached).
    app = await makeApp();
    const fb = await app.inject({ method: "GET", url: "/api/trips/001/google-route" });
    expect(fb.json()).toEqual({ fallback: true, reason: "disabled" });
    expect(fb.headers["cdn-cache-control"]).toBe("no-store");
    expect(fb.headers["cache-control"]).toBe("no-store");
  });
});

describe("google-route cost-guard observability (Phase 16)", () => {
  function makeEnv(overrides: Record<string, string> = {}) {
    return readServerEnv({
      NODE_ENV: "test",
      TRIP_GPS_STORE: "memory",
      GOOGLE_MAPS_ROUTES_API_KEY: "fake-key",
      ...overrides,
    });
  }

  it("logs cache miss→upstream then cache hit, never the API key", async () => {
    vi.stubGlobal("fetch", makeFetchSuccess());
    const log = { info: vi.fn(), error: vi.fn() };
    const handler = createGoogleRouteHandler(makeEnv(), log);

    await handler("001"); // miss → upstream
    await handler("001"); // hit → cache

    const events = log.info.mock.calls.map((call) => call[0]);
    expect(events).toContainEqual(expect.objectContaining({ cache: "miss", upstreamCallsToday: 1 }));
    expect(events).toContainEqual(expect.objectContaining({ cache: "hit" }));

    // The API key must never appear in any logged field.
    const serialized = JSON.stringify(log.info.mock.calls) + JSON.stringify(log.error.mock.calls);
    expect(serialized).not.toContain("fake-key");
  });

  it("logs the quota guard when the daily cap is exhausted", async () => {
    const fetchSpy = vi.fn() as unknown as typeof globalThis.fetch;
    vi.stubGlobal("fetch", fetchSpy);
    const log = { info: vi.fn(), error: vi.fn() };
    const handler = createGoogleRouteHandler(
      makeEnv({ TRIP_GOOGLE_ROUTE_DAILY_QUOTA: "0" }),
      log
    );

    const result = await handler("001");

    expect(result).toEqual({ fallback: true, reason: "quota" });
    expect(log.info.mock.calls.map((call) => call[0])).toContainEqual(
      expect.objectContaining({ guard: "quota" })
    );
  });

  it("coalesces concurrent cache-misses into ONE upstream call (single-flight)", async () => {
    const mockFetch = makeFetchSuccess();
    vi.stubGlobal("fetch", mockFetch);
    const log = { info: vi.fn(), error: vi.fn() };
    const handler = createGoogleRouteHandler(makeEnv(), log);

    const results = await Promise.all([
      handler("001"),
      handler("001"),
      handler("001"),
      handler("001"),
      handler("001"),
    ]);

    // 5 concurrent misses, but only ONE billed upstream call.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    for (const r of results) {
      expect(r.fallback).toBe(false);
    }
    // The coalesced joiners are logged, not billed.
    expect(log.info.mock.calls.map((c) => c[0])).toContainEqual(
      expect.objectContaining({ cache: "coalesced" })
    );
  });

  it("reserves quota before the upstream call and does not refund on error", async () => {
    // quota=1; first call fails upstream -> slot stays consumed (conservative).
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }) as unknown as typeof globalThis.fetch;
    vi.stubGlobal("fetch", mockFetch);
    const log = { info: vi.fn(), error: vi.fn() };
    const handler = createGoogleRouteHandler(
      makeEnv({ TRIP_GOOGLE_ROUTE_DAILY_QUOTA: "1" }),
      log
    );

    const first = await handler("001");
    expect(first).toEqual({ fallback: true, reason: "upstream_error" });

    // Slot already burned -> next request is quota-blocked, no 2nd upstream call.
    const second = await handler("001");
    expect(second).toEqual({ fallback: true, reason: "quota" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
