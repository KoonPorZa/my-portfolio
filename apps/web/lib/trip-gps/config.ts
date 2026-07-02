import "server-only";

type ServerEnvName =
  | "TRIP_GPS_ENABLED"
  | "TRIP_GPS_SUPABASE_URL"
  | "TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY";

export type GpsConfig = {
  enabled: boolean;
  publicUiEnabled: boolean;
  externalApiBase: string | null;
  supabaseUrl: string | null;
  supabaseServiceRoleKey: string | null;
  missingServerEnv: readonly ServerEnvName[];
};

// Required server-only .env.local keys: TRIP_GPS_ENABLED=1,
// TRIP_GPS_SUPABASE_URL, TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY.
// Optional public UI flag: NEXT_PUBLIC_TRIP_GPS_UI=1. It never authorizes
// capture/upload; later phases still require server-issued tokens.
const requiredServerEnv: readonly ServerEnvName[] = [
  "TRIP_GPS_ENABLED",
  "TRIP_GPS_SUPABASE_URL",
  "TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY",
];

function readEnv(name: ServerEnvName): string | null {
  const value = process.env[name]?.trim();

  return value ? value : null;
}

function readPublicEnv(name: "NEXT_PUBLIC_TRIP_GPS_API_BASE"): string | null {
  const value = process.env[name]?.trim();

  return value ? value : null;
}

const missingServerEnv = requiredServerEnv.filter((name) => {
  if (name === "TRIP_GPS_ENABLED") {
    return process.env.TRIP_GPS_ENABLED !== "1";
  }

  return readEnv(name) === null;
});

// NEXT_PUBLIC_TRIP_GPS_UI is inlined at build time. Touch this module when the
// flag changes so Next re-prerenders /trip/001/share (env-only changes don't
// invalidate a static page's build cache on their own).
const publicUiEnabled = process.env.NEXT_PUBLIC_TRIP_GPS_UI === "1";
const externalApiBase = readPublicEnv("NEXT_PUBLIC_TRIP_GPS_API_BASE");
const fallbackApiEnabled = missingServerEnv.length === 0;

export const gpsConfig: GpsConfig = Object.freeze({
  enabled: publicUiEnabled && (externalApiBase !== null || fallbackApiEnabled),
  publicUiEnabled,
  externalApiBase,
  supabaseUrl: readEnv("TRIP_GPS_SUPABASE_URL"),
  supabaseServiceRoleKey: readEnv("TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY"),
  missingServerEnv,
});

export function isGpsEnabled(): boolean {
  return gpsConfig.enabled;
}
