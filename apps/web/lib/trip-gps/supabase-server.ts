import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { TrackerMode, UploadReason } from "./types";

type TripShareSessionRow = {
  id: string;
  trip_id: string;
  active: boolean;
  expires_at: string;
  revoked_at: string | null;
  stopped_at: string | null;
  last_viewer_access_at: string | null;
  upload_count: number;
  last_error: string | null;
  owner_token_hash: string;
  viewer_token_hash: string;
};

type TripLocationLatestRow = {
  session_id: string;
  lat: number;
  lng: number;
  accuracy_m: number;
  speed_mps: number | null;
  heading_deg: number | null;
  mode: TrackerMode;
  reason: UploadReason;
  client_ts: string;
  server_ts: string;
};

type TripLocationPointRow = TripLocationLatestRow & {
  seq: number;
};

export type TripGpsDatabase = {
  public: {
    Tables: {
      trip_share_sessions: {
        Row: TripShareSessionRow;
        Insert: TripShareSessionRow;
        Update: Partial<TripShareSessionRow>;
        Relationships: [];
      };
      trip_location_latest: {
        Row: TripLocationLatestRow;
        Insert: TripLocationLatestRow;
        Update: Partial<TripLocationLatestRow>;
        Relationships: [];
      };
      trip_location_points: {
        Row: TripLocationPointRow;
        Insert: TripLocationPointRow;
        Update: Partial<TripLocationPointRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type TripGpsSupabaseClient = SupabaseClient<TripGpsDatabase>;
export type TripGpsTable<
  TableName extends keyof TripGpsDatabase["public"]["Tables"],
> = TripGpsDatabase["public"]["Tables"][TableName];

let supabaseServerClient: TripGpsSupabaseClient | null = null;

export function getSupabaseServerClient(): TripGpsSupabaseClient {
  if (supabaseServerClient) {
    return supabaseServerClient;
  }

  const url = readEnv("TRIP_GPS_SUPABASE_URL");
  const serviceRoleKey = readEnv("TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY");

  if (!hasRealSupabaseConfig(url, serviceRoleKey)) {
    throw new Error(
      "Trip GPS Supabase is not configured with real server-only env. Set TRIP_GPS_SUPABASE_URL to your Supabase project URL and TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY to its service-role key."
    );
  }

  supabaseServerClient = createClient<TripGpsDatabase>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    db: {
      schema: "public",
    },
  });

  return supabaseServerClient;
}

export function hasRealSupabaseConfig(
  url = readEnv("TRIP_GPS_SUPABASE_URL"),
  serviceRoleKey = readEnv("TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY")
): boolean {
  return isUsableUrl(url) && isUsableSecret(serviceRoleKey);
}

function readEnv(name: "TRIP_GPS_SUPABASE_URL" | "TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY"): string {
  return process.env[name]?.trim() ?? "";
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
