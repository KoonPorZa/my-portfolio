import type { FastifyBaseLogger } from "fastify";

import type { ServerEnv } from "../../config/env";
import { TRIP_001_STOP_COORDS } from "./trip-gps.service";
import { TRIP_GPS_MVP_TRIP_ID } from "./trip-gps.types";

const GOOGLE_ROUTES_URL =
  "https://routes.googleapis.com/directions/v2:computeRoutes";
const GOOGLE_FIELD_MASK =
  "routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration";
const FETCH_TIMEOUT_MS = 8_000;

export type GoogleRouteSuccess = {
  fallback: false;
  encodedPolyline: string;
  distanceMeters: number;
  durationSeconds: number;
  source: "google";
  cachedAt: string;
  expiresAt: string;
};

export type GoogleRouteFallback = {
  fallback: true;
  reason: "disabled" | "quota" | "upstream_error";
};

export type GoogleRouteResult = GoogleRouteSuccess | GoogleRouteFallback;

type CacheEntry = {
  data: GoogleRouteSuccess;
  expiresAt: number;
};

type DayCounter = {
  utcDay: string;
  count: number;
};

export type GoogleRouteHandler = (tripId: string) => Promise<GoogleRouteResult>;

export function createGoogleRouteHandler(
  env: ServerEnv,
  // `info` powers cost-guard observability (cache hit/miss, upstream count,
  // quota state). The API key is NEVER included in any log field.
  log: Pick<FastifyBaseLogger, "error" | "info"> = console
): GoogleRouteHandler {
  const cache = new Map<string, CacheEntry>();
  let dayCounter: DayCounter = { utcDay: "", count: 0 };

  return async function handleGoogleRoute(
    tripId: string
  ): Promise<GoogleRouteResult> {
    if (!env.googleMapsRoutesApiKey) {
      return { fallback: true, reason: "disabled" };
    }

    if (tripId !== TRIP_GPS_MVP_TRIP_ID) {
      return { fallback: true, reason: "upstream_error" };
    }

    const cacheKey = buildCacheKey(tripId);
    const now = Date.now();

    const cached = cache.get(cacheKey);

    if (cached && now < cached.expiresAt) {
      log.info(
        { tripId, cache: "hit", expiresAt: cached.data.expiresAt },
        "[google-route] served planned route from cache"
      );
      return cached.data;
    }

    const utcDay = utcDayString(now);

    if (dayCounter.utcDay !== utcDay) {
      dayCounter = { utcDay, count: 0 };
    }

    if (dayCounter.count >= env.tripGoogleRouteDailyQuota) {
      log.info(
        {
          tripId,
          cache: "miss",
          guard: "quota",
          upstreamCallsToday: dayCounter.count,
          dailyQuota: env.tripGoogleRouteDailyQuota,
        },
        "[google-route] daily upstream quota reached — serving free-map fallback"
      );
      return { fallback: true, reason: "quota" };
    }

    const result = await fetchGoogleRoute(env.googleMapsRoutesApiKey, log);

    if (!result) {
      return { fallback: true, reason: "upstream_error" };
    }

    dayCounter.count += 1;

    log.info(
      {
        tripId,
        cache: "miss",
        upstreamCallsToday: dayCounter.count,
        dailyQuota: env.tripGoogleRouteDailyQuota,
        nearQuota: dayCounter.count >= env.tripGoogleRouteDailyQuota,
      },
      "[google-route] fetched fresh planned route from Google Routes API"
    );

    const ttlMs = env.tripGoogleRouteCacheTtlSeconds * 1_000;
    const cachedAt = new Date(now).toISOString();
    const expiresAt = new Date(now + ttlMs).toISOString();

    const entry: GoogleRouteSuccess = {
      fallback: false,
      encodedPolyline: result.encodedPolyline,
      distanceMeters: result.distanceMeters,
      durationSeconds: result.durationSeconds,
      source: "google",
      cachedAt,
      expiresAt,
    };

    cache.set(cacheKey, { data: entry, expiresAt: now + ttlMs });

    return entry;
  };
}

async function fetchGoogleRoute(
  apiKey: string,
  log: Pick<FastifyBaseLogger, "error">
): Promise<{ encodedPolyline: string; distanceMeters: number; durationSeconds: number } | null> {
  const origin = TRIP_001_STOP_COORDS[0];
  const destination = TRIP_001_STOP_COORDS[TRIP_001_STOP_COORDS.length - 1];
  const intermediates = TRIP_001_STOP_COORDS.slice(1, -1);

  if (!origin || !destination) {
    return null;
  }

  const body = {
    origin: { location: { latLng: { latitude: origin[0], longitude: origin[1] } } },
    destination: {
      location: { latLng: { latitude: destination[0], longitude: destination[1] } },
    },
    intermediates: intermediates.map((coord) => ({
      location: { latLng: { latitude: coord[0], longitude: coord[1] } },
    })),
    travelMode: "TWO_WHEELER",
    polylineQuality: "HIGH_QUALITY",
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(GOOGLE_ROUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": GOOGLE_FIELD_MASK,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      log.error({ status: response.status }, "[google-route] upstream returned non-200");
      return null;
    }

    const json = (await response.json()) as {
      routes?: Array<{
        polyline?: { encodedPolyline?: string };
        distanceMeters?: number;
        duration?: string;
      }>;
    };

    const route = json.routes?.[0];
    const encodedPolyline = route?.polyline?.encodedPolyline;
    const distanceMeters = route?.distanceMeters;
    const durationStr = route?.duration;

    if (
      typeof encodedPolyline !== "string" ||
      typeof distanceMeters !== "number" ||
      typeof durationStr !== "string"
    ) {
      log.error("[google-route] upstream response missing expected fields");
      return null;
    }

    const durationSeconds = parseInt(durationStr, 10);

    if (!Number.isFinite(durationSeconds)) {
      log.error("[google-route] upstream duration could not be parsed");
      return null;
    }

    return { encodedPolyline, distanceMeters, durationSeconds };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      log.error("[google-route] upstream request timed out");
    } else {
      log.error("[google-route] upstream request failed");
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function buildCacheKey(tripId: string): string {
  return `${tripId}:trip001`;
}

function utcDayString(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}
