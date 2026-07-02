export type TripGpsStoreRequest = "auto" | "supabase" | "mock" | "memory";
export type TripGpsStoreMode = "supabase" | "memory";

export type TrustProxySetting = boolean | number | string;

export type ServerEnv = {
  nodeEnv: string;
  port: number;
  corsOrigins: readonly string[];
  tripGpsEnabled: boolean;
  tripGpsStore: TripGpsStoreRequest;
  selectedTripGpsStore: TripGpsStoreMode;
  tripGpsSupabaseUrl: string;
  tripGpsSupabaseServiceRoleKey: string;
  tripGpsOwnerCode: string;
  googleMapsRoutesApiKey: string;
  tripGoogleRouteCacheTtlSeconds: number;
  tripGoogleRouteDailyQuota: number;
  // --- Phase 14: API hardening -------------------------------------------
  // How many proxy hops to trust when deriving request.ip. Railway sits behind
  // one proxy, so the default is 1 (NOT `true`, which trusts a client-supplied
  // x-forwarded-for and makes every per-IP limit spoofable). Set to 2 if the API
  // is also Cloudflare-proxied. Verify request.ip on the real host (docs/env-doc.md).
  trustProxy: TrustProxySetting;
  // Max request body size in bytes. GPS payloads are tiny; a small cap rejects
  // junk/oversized writes with 413 before they touch the store.
  bodyLimitBytes: number;
  rateLimitWindow: string;
  rateLimitViewerMax: number;
  rateLimitOwnerMax: number;
  rateLimitSessionStartMax: number;
  rateLimitGoogleRouteMax: number;
  // Owner-code brute-force guard: after N wrong codes from one client IP, lock
  // that IP for a cooldown window and answer with a generic 401 (no oracle).
  ownerCodeMaxAttempts: number;
  ownerCodeLockMs: number;
  // --- Phase 16: observability -------------------------------------------
  // Git commit the running instance was built from (Railway injects
  // RAILWAY_GIT_COMMIT_SHA); surfaced on /health and /version.
  gitCommitSha: string;
};

type EnvSource = NodeJS.ProcessEnv | Record<string, string | undefined>;

const DEFAULT_PORT = 3000;

export function readServerEnv(source: EnvSource = process.env): ServerEnv {
  const nodeEnv = trim(source.NODE_ENV) || "development";
  const port = readPort(source.PORT);
  const tripGpsStore = readStore(source.TRIP_GPS_STORE);
  const tripGpsSupabaseUrl = trim(source.TRIP_GPS_SUPABASE_URL);
  const tripGpsSupabaseServiceRoleKey = trim(
    source.TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY
  );
  const selectedTripGpsStore = selectTripGpsStore({
    nodeEnv,
    requestedStore: tripGpsStore,
    supabaseUrl: tripGpsSupabaseUrl,
    supabaseServiceRoleKey: tripGpsSupabaseServiceRoleKey,
  });

  return {
    nodeEnv,
    port,
    corsOrigins: splitOrigins(source.CORS_ORIGINS),
    tripGpsEnabled: source.TRIP_GPS_ENABLED === "1",
    tripGpsStore,
    selectedTripGpsStore,
    tripGpsSupabaseUrl,
    tripGpsSupabaseServiceRoleKey,
    tripGpsOwnerCode: trim(source.TRIP_GPS_OWNER_CODE),
    googleMapsRoutesApiKey: trim(source.GOOGLE_MAPS_ROUTES_API_KEY),
    tripGoogleRouteCacheTtlSeconds: readPositiveInteger(
      source.TRIP_GOOGLE_ROUTE_CACHE_TTL_SECONDS,
      86_400
    ),
    tripGoogleRouteDailyQuota: readNonNegativeInteger(
      source.TRIP_GOOGLE_ROUTE_DAILY_QUOTA,
      50
    ),
    trustProxy: readTrustProxy(source.TRUST_PROXY),
    bodyLimitBytes: readPositiveInteger(source.BODY_LIMIT_BYTES, 16_384),
    rateLimitWindow: trim(source.RATE_LIMIT_WINDOW) || "1 minute",
    rateLimitViewerMax: readPositiveInteger(source.RATE_LIMIT_VIEWER_MAX, 60),
    rateLimitOwnerMax: readPositiveInteger(source.RATE_LIMIT_OWNER_MAX, 20),
    rateLimitSessionStartMax: readPositiveInteger(
      source.RATE_LIMIT_SESSION_START_MAX,
      5
    ),
    rateLimitGoogleRouteMax: readPositiveInteger(
      source.RATE_LIMIT_GOOGLE_ROUTE_MAX,
      10
    ),
    ownerCodeMaxAttempts: readPositiveInteger(
      source.OWNER_CODE_MAX_ATTEMPTS,
      10
    ),
    ownerCodeLockMs:
      readPositiveInteger(source.OWNER_CODE_LOCK_MINUTES, 15) * 60_000,
    gitCommitSha:
      trim(source.RAILWAY_GIT_COMMIT_SHA) || trim(source.GIT_SHA) || "",
  };
}

// Fastify's `trustProxy` accepts a boolean, a hop count, or a comma-separated
// list of trusted IPs/subnets. `true` trusts a client-supplied
// x-forwarded-for (spoofable) — avoid it. Default: trust 1 hop (Railway).
function readTrustProxy(value: string | undefined): TrustProxySetting {
  const normalized = trim(value);

  if (!normalized) {
    return 1;
  }

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  const asNumber = Number(normalized);
  if (Number.isInteger(asNumber) && asNumber >= 0) {
    return asNumber;
  }

  return normalized;
}

export function hasRealSupabaseConfig(
  url: string,
  serviceRoleKey: string
): boolean {
  return isUsableUrl(url) && isUsableSecret(serviceRoleKey);
}

function selectTripGpsStore(input: {
  nodeEnv: string;
  requestedStore: TripGpsStoreRequest;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}): TripGpsStoreMode {
  if (input.requestedStore === "supabase") {
    if (!hasRealSupabaseConfig(input.supabaseUrl, input.supabaseServiceRoleKey)) {
      throw new Error(
        "TRIP_GPS_STORE=supabase requires real TRIP_GPS_SUPABASE_URL and TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY values."
      );
    }

    return "supabase";
  }

  if (input.requestedStore === "mock" || input.requestedStore === "memory") {
    return "memory";
  }

  return input.nodeEnv === "production" &&
    hasRealSupabaseConfig(input.supabaseUrl, input.supabaseServiceRoleKey)
    ? "supabase"
    : "memory";
}

function readStore(value: string | undefined): TripGpsStoreRequest {
  const normalized = trim(value).toLowerCase();

  if (
    normalized === "supabase" ||
    normalized === "mock" ||
    normalized === "memory" ||
    normalized === "auto"
  ) {
    return normalized;
  }

  if (!normalized) {
    return "auto";
  }

  throw new Error(
    "TRIP_GPS_STORE must be one of auto, supabase, mock, or memory."
  );
}

function readPort(value: string | undefined): number {
  const normalized = trim(value);

  if (!normalized) {
    return DEFAULT_PORT;
  }

  const port = Number(normalized);

  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return port;
}

function splitOrigins(value: string | undefined): readonly string[] {
  return trim(value)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isUsableUrl(value: string): boolean {
  if (isPlaceholder(value)) {
    return false;
  }

  try {
    const url = new URL(value);

    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isUsableSecret(value: string): boolean {
  return value.length >= 32 && !isPlaceholder(value);
}

function isPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  return (
    !normalized ||
    normalized.includes("example") ||
    normalized.includes("placeholder") ||
    normalized.includes("replace") ||
    normalized.includes("your-") ||
    normalized.includes("your_")
  );
}

function readPositiveInteger(value: string | undefined, defaultValue: number): number {
  const normalized = trim(value);

  if (!normalized) {
    return defaultValue;
  }

  const parsed = Number(normalized);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

function readNonNegativeInteger(value: string | undefined, defaultValue: number): number {
  const normalized = trim(value);

  if (!normalized) {
    return defaultValue;
  }

  const parsed = Number(normalized);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : defaultValue;
}

function trim(value: string | undefined): string {
  return value?.trim() ?? "";
}
