"use client";

import { useEffect, useState } from "react";

import { getSupabaseBrowser } from "@/lib/supabase-browser";
import styles from "./trip.module.css";

type LiveLocation = {
  lat: number;
  lng: number;
  speedMps: number | null;
  mode: string;
};

type LiveState =
  | { status: "connecting" }
  | { status: "idle" }
  | { status: "live"; loc: LiveLocation }
  | { status: "unavailable" };

const MODE_LABEL: Record<string, string> = {
  active: "ปกติ",
  saver: "ประหยัดแบต",
  rest: "พัก",
  city: "ในเมือง",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
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
    speedMps: typeof row.speed_mps === "number" ? row.speed_mps : null,
    mode: typeof row.mode === "string" ? row.mode : "active",
  };
}

// Subscribes to Supabase Realtime for the latest shared location. A row in
// trip_location_latest exists only while a session is active (the session-end
// trigger deletes it), so presence = "currently sharing".
function useLiveLocation(): LiveState {
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
      .select("lat,lng,speed_mps,mode,server_ts")
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

export function TripLiveStatus() {
  const state = useLiveLocation();
  const live = state.status === "live" ? state.loc : null;

  return (
    <section id="live" className={cx(styles.liveStatus, live && styles.liveStatusLive)} aria-live="polite">
      {live ? (
        <>
          <div className={styles.liveStatusHead}>
            <span className={styles.liveBadge}>
              <span className={styles.liveBadgeDot} aria-hidden="true" />
              LIVE
            </span>
            <span className={styles.liveStatusTitle}>กำลังแชร์ตำแหน่งสด</span>
          </div>
          <p className={styles.liveStatusMeta}>
            พิกัด {live.lat.toFixed(5)}, {live.lng.toFixed(5)}
            {live.speedMps != null ? ` · ~${Math.round(live.speedMps * 3.6)} กม./ชม.` : ""}
            {MODE_LABEL[live.mode] ? ` · โหมด ${MODE_LABEL[live.mode]}` : ""}
          </p>
          <div className={styles.liveStatusActions}>
            <a
              className={styles.liveMapLink}
              href={`https://www.google.com/maps/search/?api=1&query=${live.lat},${live.lng}`}
              target="_blank"
              rel="noreferrer"
            >
              เปิดใน Google Maps ↗
            </a>
            <span className={styles.liveStatusUpdated}>อัปเดตอัตโนมัติแบบ realtime</span>
          </div>
        </>
      ) : (
        <p className={styles.liveStatusIdle}>
          <span className={styles.liveIdleDot} aria-hidden="true" />
          {state.status === "connecting"
            ? "กำลังเชื่อมต่อสถานะการแชร์…"
            : state.status === "unavailable"
              ? "ยังไม่ได้ตั้งค่าการติดตามสด"
              : "ยังไม่มีการแชร์ตำแหน่งตอนนี้ — หน้านี้จะขึ้นเองแบบ realtime เมื่อเริ่มแชร์"}
        </p>
      )}
    </section>
  );
}
