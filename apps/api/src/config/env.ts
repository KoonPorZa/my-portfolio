export type TripGpsStoreRequest = "auto" | "supabase" | "mock" | "memory";
export type TripGpsStoreMode = "supabase" | "memory";

export type ServerEnv = {
  nodeEnv: string;
  port: number;
  corsOrigins: readonly string[];
  tripGpsEnabled: boolean;
  tripGpsStore: TripGpsStoreRequest;
  selectedTripGpsStore: TripGpsStoreMode;
  tripGpsSupabaseUrl: string;
  tripGpsSupabaseServiceRoleKey: string;
  tripGpsOwnerCodeHash: string;
  tripGpsOwnerCodeSha256: string;
  tripGpsOwnerCode: string;
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
    tripGpsOwnerCodeHash: trim(source.TRIP_GPS_OWNER_CODE_HASH),
    tripGpsOwnerCodeSha256: trim(source.TRIP_GPS_OWNER_CODE_SHA256),
    tripGpsOwnerCode: trim(source.TRIP_GPS_OWNER_CODE),
  };
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

function trim(value: string | undefined): string {
  return value?.trim() ?? "";
}
