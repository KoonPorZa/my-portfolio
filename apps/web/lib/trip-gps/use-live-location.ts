"use client";

import { useEffect, useState } from "react";

import { getSupabaseBrowser } from "@/lib/supabase-browser";

export type LiveLocation = {
  lat: number;
  lng: number;
  accuracyM: number | null;
  speedMps: number | null;
  headingDeg: number | null;
  mode: string;
  clientTs: string | null;
  serverTs: string | null;
};

export type LiveState =
  | { status: "connecting" }
  | { status: "idle" }
  | { status: "live"; loc: LiveLocation }
  | { status: "unavailable" };

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toLoc(row: Record<string, unknown> | null | undefined): LiveLocation | null {
  if (!row) {
    return null;
  }

  const lat = Number(row.lat);
  const lng = Number(row.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    lat,
    lng,
    accuracyM: num(row.accuracy_m),
    speedMps: num(row.speed_mps),
    headingDeg: num(row.heading_deg),
    mode: str(row.mode) ?? "active",
    clientTs: str(row.client_ts),
    serverTs: str(row.server_ts),
  };
}

// Subscribes to Supabase Realtime for the latest shared location on trip 001.
// A row in trip_location_latest exists only while a session is active (the
// session-end trigger deletes it), so presence = "currently sharing".
export function useLiveLocation(): LiveState {
  const [state, setState] = useState<LiveState>({ status: "connecting" });

  useEffect(() => {
    const supabase = getSupabaseBrowser();

    if (!supabase) {
      setState({ status: "unavailable" });
      return undefined;
    }

    let subscribed = true;

    void supabase
      .from("trip_location_latest")
      .select("lat,lng,accuracy_m,speed_mps,heading_deg,mode,client_ts,server_ts")
      .order("server_ts", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (!subscribed) {
          return;
        }

        const loc = toLoc(data?.[0]);
        setState(loc ? { status: "live", loc } : { status: "idle" });
      });

    const channel = supabase
      .channel("trip-001-live-location")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trip_location_latest" },
        (payload) => {
          if (!subscribed) {
            return;
          }

          if (payload.eventType === "DELETE") {
            setState({ status: "idle" });
            return;
          }

          const loc = toLoc(payload.new as Record<string, unknown>);
          setState(loc ? { status: "live", loc } : { status: "idle" });
        }
      )
      .subscribe();

    return () => {
      subscribed = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  return state;
}
