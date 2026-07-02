"use client";

import { useEffect, useRef, useState } from "react";

import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { StopArrival, StopArrivalSource } from "@/lib/trip-gps/types";

export type LiveLocation = {
  sessionId: string | null;
  lat: number;
  lng: number;
  accuracyM: number | null;
  speedMps: number | null;
  headingDeg: number | null;
  mode: string;
  clientTs: string | null;
  serverTs: string | null;
};

export type LiveTrackPoint = LiveLocation & {
  seq: number | null;
};

export type LiveState =
  | { status: "connecting"; track: LiveTrackPoint[]; stopArrivals: StopArrival[] }
  | { status: "idle"; track: LiveTrackPoint[]; stopArrivals: StopArrival[] }
  | {
      status: "live";
      loc: LiveLocation;
      track: LiveTrackPoint[];
      stopArrivals: StopArrival[];
    }
  | { status: "unavailable"; track: LiveTrackPoint[]; stopArrivals: StopArrival[] };

const TRACK_LIMIT = 1500;

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
    sessionId: str(row.session_id),
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

function toTrackPoint(row: Record<string, unknown> | null | undefined): LiveTrackPoint | null {
  const loc = toLoc(row);

  if (!loc) {
    return null;
  }

  return {
    ...loc,
    seq: typeof row?.seq === "number" && Number.isInteger(row.seq) ? row.seq : null,
  };
}

function toStopArrival(
  row: Record<string, unknown> | null | undefined
): (StopArrival & { sessionId: string | null }) | null {
  if (!row) {
    return null;
  }

  const index = row.stop_index;
  const arrivedAt = row.arrived_at;

  if (typeof index !== "number" || !Number.isInteger(index) || typeof arrivedAt !== "string") {
    return null;
  }

  const source: StopArrivalSource = row.source === "manual" ? "manual" : "auto";

  return {
    index,
    arrivedAt,
    source,
    sessionId: str(row.session_id),
  };
}

function upsertTrackPoint(track: LiveTrackPoint[], point: LiveTrackPoint): LiveTrackPoint[] {
  const matchIndex = track.findIndex((item) => {
    if (point.seq !== null && item.seq !== null) {
      return item.seq === point.seq;
    }

    return item.serverTs !== null && item.serverTs === point.serverTs;
  });

  const next = [...track];

  if (matchIndex >= 0) {
    next[matchIndex] = point;
  } else {
    next.push(point);
  }

  return next
    .sort((a, b) => {
      if (a.seq !== null && b.seq !== null) {
        return a.seq - b.seq;
      }

      return timestampMs(a.serverTs) - timestampMs(b.serverTs);
    })
    .slice(-TRACK_LIMIT);
}

function upsertStopArrival(arrivals: StopArrival[], arrival: StopArrival): StopArrival[] {
  const matchIndex = arrivals.findIndex((item) => item.index === arrival.index);
  const next = [...arrivals];

  if (matchIndex >= 0) {
    next[matchIndex] = arrival;
  } else {
    next.push(arrival);
  }

  return next.sort((a, b) => a.index - b.index);
}

function timestampMs(value: string | null): number {
  const ms = Date.parse(value ?? "");
  return Number.isFinite(ms) ? ms : 0;
}

// Subscribes to Supabase Realtime for the latest shared location on trip 001.
// A row in trip_location_latest exists only while a session is active (the
// session-end trigger deletes it), so presence = "currently sharing". The
// breadcrumb (trip_location_points) and stop arrivals (trip_stop_arrivals) are
// read + subscribed for the same session so the public viewer shows the travelled
// track and the arrival timeline. Those two tables need an anon `select` RLS
// policy + realtime publication membership (see plans/feature-gps/sql/schema.sql);
// without them these simply stay empty (no crash).
export function useLiveLocation(): LiveState {
  const [state, setState] = useState<LiveState>({
    status: "connecting",
    track: [],
    stopArrivals: [],
  });
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowser();

    if (!supabase) {
      const timeoutId = window.setTimeout(() => {
        setState({ status: "unavailable", track: [], stopArrivals: [] });
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }

    let subscribed = true;

    const loadTrack = (sessionId: string) => {
      void supabase
        .from("trip_location_points")
        .select("session_id,seq,lat,lng,accuracy_m,speed_mps,heading_deg,mode,client_ts,server_ts")
        .eq("session_id", sessionId)
        .order("seq", { ascending: true })
        .limit(TRACK_LIMIT)
        .then(({ data }) => {
          if (!subscribed || sessionIdRef.current !== sessionId) {
            return;
          }

          const track = (data ?? []).flatMap((row) => {
            const point = toTrackPoint(row as Record<string, unknown>);
            return point ? [point] : [];
          });

          setState((current) => ({ ...current, track }));
        });
    };

    const loadArrivals = (sessionId: string) => {
      void supabase
        .from("trip_stop_arrivals")
        .select("session_id,stop_index,arrived_at,source")
        .eq("session_id", sessionId)
        .order("stop_index", { ascending: true })
        .then(({ data }) => {
          if (!subscribed || sessionIdRef.current !== sessionId) {
            return;
          }

          const stopArrivals = (data ?? []).flatMap((row) => {
            const arrival = toStopArrival(row as Record<string, unknown>);
            return arrival ? [{ index: arrival.index, arrivedAt: arrival.arrivedAt, source: arrival.source }] : [];
          });

          setState((current) => ({ ...current, stopArrivals }));
        });
    };

    const loadSessionExtras = (sessionId: string) => {
      loadTrack(sessionId);
      loadArrivals(sessionId);
    };

    void supabase
      .from("trip_location_latest")
      .select("session_id,lat,lng,accuracy_m,speed_mps,heading_deg,mode,client_ts,server_ts")
      .order("server_ts", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (!subscribed) {
          return;
        }

        const loc = toLoc(data?.[0]);
        sessionIdRef.current = loc?.sessionId ?? null;
        setState(
          loc
            ? { status: "live", loc, track: [], stopArrivals: [] }
            : { status: "idle", track: [], stopArrivals: [] }
        );

        if (loc?.sessionId) {
          loadSessionExtras(loc.sessionId);
        }
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
            sessionIdRef.current = null;
            setState((current) => ({
              status: "idle",
              track: current.track,
              stopArrivals: current.stopArrivals,
            }));
            return;
          }

          const loc = toLoc(payload.new as Record<string, unknown>);

          if (!loc) {
            setState((current) => ({
              status: "idle",
              track: current.track,
              stopArrivals: current.stopArrivals,
            }));
            return;
          }

          const previousSessionId = sessionIdRef.current;
          const sessionChanged =
            Boolean(previousSessionId) &&
            Boolean(loc.sessionId) &&
            previousSessionId !== loc.sessionId;
          sessionIdRef.current = loc.sessionId;
          setState((current) => ({
            status: "live",
            loc,
            track: sessionChanged ? [] : current.track,
            stopArrivals: sessionChanged ? [] : current.stopArrivals,
          }));

          if (loc.sessionId && previousSessionId !== loc.sessionId) {
            loadSessionExtras(loc.sessionId);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trip_location_points" },
        (payload) => {
          if (!subscribed || payload.eventType === "DELETE") {
            return;
          }

          const point = toTrackPoint(payload.new as Record<string, unknown>);

          if (!point?.sessionId) {
            return;
          }

          if (!sessionIdRef.current) {
            sessionIdRef.current = point.sessionId;
          }

          if (sessionIdRef.current !== point.sessionId) {
            return;
          }

          setState((current) => ({
            ...current,
            track: upsertTrackPoint(current.track, point),
          }));
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trip_stop_arrivals" },
        (payload) => {
          if (!subscribed) {
            return;
          }

          if (payload.eventType === "DELETE") {
            const removed = toStopArrival(payload.old as Record<string, unknown>);
            if (!removed) {
              return;
            }
            setState((current) => ({
              ...current,
              stopArrivals: current.stopArrivals.filter((item) => item.index !== removed.index),
            }));
            return;
          }

          const arrival = toStopArrival(payload.new as Record<string, unknown>);

          if (!arrival?.sessionId || sessionIdRef.current !== arrival.sessionId) {
            return;
          }

          setState((current) => ({
            ...current,
            stopArrivals: upsertStopArrival(current.stopArrivals, {
              index: arrival.index,
              arrivedAt: arrival.arrivedAt,
              source: arrival.source,
            }),
          }));
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
