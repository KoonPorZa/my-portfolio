import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildApp } from "../app";
import { readServerEnv } from "../config/env";

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
});
