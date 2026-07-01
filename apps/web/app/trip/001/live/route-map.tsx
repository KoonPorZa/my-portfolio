"use client";

import dynamic from "next/dynamic";

import styles from "./route-map.module.css";

// maplibre-gl touches browser globals, so keep it out of SSR entirely and load
// the map only on the client. The frame below reserves height either way so
// there's no layout shift while it loads.
const RouteMapImpl = dynamic(() => import("./route-map-impl").then((m) => m.RouteMapImpl), {
  ssr: false,
  loading: () => <div className={styles.mapLoading}>กำลังโหลดแผนที่…</div>,
});

type LivePoint = { lat: number; lng: number } | null;

export function TripRouteMap({ live = null }: { live?: LivePoint }) {
  return (
    <div className={styles.mapFrame}>
      <RouteMapImpl live={live} />
    </div>
  );
}
