import "server-only";

type ServerEnvName =
  | "TRIP_GPS_ENABLED"
  | "TRIP_GPS_SUPABASE_URL"
  | "TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY";

export type GpsConfig = {
  enabled: boolean;
  publicUiEnabled: boolean;
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

const missingServerEnv = requiredServerEnv.filter((name) => {
  if (name === "TRIP_GPS_ENABLED") {
    return process.env.TRIP_GPS_ENABLED !== "1";
  }

  return readEnv(name) === null;
});

export const gpsConfig: GpsConfig = Object.freeze({
  enabled: missingServerEnv.length === 0,
  publicUiEnabled: process.env.NEXT_PUBLIC_TRIP_GPS_UI === "1",
  supabaseUrl: readEnv("TRIP_GPS_SUPABASE_URL"),
  supabaseServiceRoleKey: readEnv("TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY"),
  missingServerEnv,
});

export function isGpsEnabled(): boolean {
  return gpsConfig.enabled;
}
