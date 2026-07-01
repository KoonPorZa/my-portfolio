"use client";

import dynamic from "next/dynamic";

import { ROUTE_SOURCE_META } from "@/lib/trip-route-meta";
import styles from "./route-map.module.css";

// maplibre-gl touches browser globals, so keep it out of SSR entirely and load
// the map only on the client. The frame below reserves height either way so
// there's no layout shift while it loads.
const RouteMapImpl = dynamic(() => import("./route-map-impl").then((m) => m.RouteMapImpl), {
  ssr: false,
  loading: () => <div className={styles.mapLoading}>กำลังโหลดแผนที่…</div>,
});

type LivePoint = { lat: number; lng: number } | null;
type TrackPoint = { lat: number; lng: number };

export function TripRouteMap({
  live = null,
  actualTrack = [],
}: {
  live?: LivePoint;
  actualTrack?: TrackPoint[];
}) {
  return (
    <div className={styles.mapFrame}>
      <span className={styles.routeSourceBadge}>
        {ROUTE_SOURCE_META.label} · ~{Math.round(ROUTE_SOURCE_META.distanceKm).toLocaleString("th-TH")} กม.
      </span>
      <div className={styles.routeLegend} aria-hidden="true">
        <span>
          <i className={styles.plannedSwatch} />
          แผน
        </span>
        <span>
          <i className={styles.actualSwatch} />
          วิ่งจริง {actualTrack.length.toLocaleString("th-TH")}
        </span>
      </div>
      <RouteMapImpl live={live} actualTrack={actualTrack} />
    </div>
  );
}
