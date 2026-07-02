"use client";

import dynamic from "next/dynamic";

import { googleMapEnabled } from "@/lib/trip-gps/google-map-config";
import styles from "./route-map.module.css";

// The live map is the Google motorcycle map only (Routes API TWO_WHEELER).
// google.maps touches browser globals, so keep it out of SSR entirely and load
// it on the client. The frame reserves height so there's no layout shift.
const GoogleRouteMap = dynamic(() => import("./google-route-map").then((m) => m.GoogleRouteMap), {
  ssr: false,
  loading: () => <div className={styles.mapLoading}>กำลังโหลดแผนที่…</div>,
});

type LivePoint = { lat: number; lng: number } | null;
type TrackPoint = { lat: number; lng: number };

type MapProps = {
  live?: LivePoint;
  actualTrack?: TrackPoint[];
};

export function TripRouteMap({ live = null, actualTrack = [] }: MapProps) {
  // Gated by the feature flag + browser key so no billed Google Maps script is
  // ever requested until the map is configured. When it's not set up, show a
  // short notice instead of a map (the header still links to Google Maps).
  if (!googleMapEnabled()) {
    return (
      <div className={styles.mapFrame}>
        <div className={styles.mapLoading}>ยังไม่ได้ตั้งค่าแผนที่ Google</div>
      </div>
    );
  }

  return (
    <div className={styles.mapFrame}>
      <div className={styles.routeLegend} aria-hidden="true">
        <span>
          <i className={styles.plannedSwatch} />
          แผน (มอเตอร์ไซค์)
        </span>
        <span>
          <i className={styles.actualSwatch} />
          วิ่งจริง {actualTrack.length.toLocaleString("th-TH")}
        </span>
      </div>
      <GoogleRouteMap live={live} actualTrack={actualTrack} />
    </div>
  );
}
