"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { googleMapEnabled } from "@/lib/trip-gps/google-map-config";
import { ROUTE_SOURCE_META } from "@/lib/trip-route-meta";
import styles from "./route-map.module.css";

// maplibre-gl touches browser globals, so keep it out of SSR entirely and load
// the map only on the client. The frame below reserves height either way so
// there's no layout shift while it loads.
const RouteMapImpl = dynamic(() => import("./route-map-impl").then((m) => m.RouteMapImpl), {
  ssr: false,
  loading: () => <div className={styles.mapLoading}>กำลังโหลดแผนที่…</div>,
});

// Loaded lazily and only when the Google feature flag is on — never imported
// when the flag is off, so no maps.googleapis.com script is ever requested.
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

/** The existing MapLibre frame — unchanged from before Phase 17. */
function MapLibreFrame({ live = null, actualTrack = [] }: MapProps) {
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

/** Toggle wrapper rendered only when googleMapEnabled() is true. */
function TripRouteMapToggle({ live = null, actualTrack = [] }: MapProps) {
  const [mode, setMode] = useState<"maplibre" | "google">("maplibre");

  return (
    <div>
      <div className={styles.mapToggleBar}>
        <button
          type="button"
          className={mode === "maplibre" ? styles.mapToggleActive : styles.mapToggle}
          onClick={() => setMode("maplibre")}
        >
          แผนที่ปกติ (ฟรี)
        </button>
        <button
          type="button"
          className={mode === "google" ? styles.mapToggleActive : styles.mapToggle}
          onClick={() => setMode("google")}
        >
          แผนที่มอเตอร์ไซค์ (Google)
        </button>
      </div>

      {mode === "google" ? (
        <div className={styles.mapFrame}>
          <GoogleRouteMap
            live={live}
            actualTrack={actualTrack}
            onFallback={() => setMode("maplibre")}
          />
        </div>
      ) : (
        <MapLibreFrame live={live} actualTrack={actualTrack} />
      )}
    </div>
  );
}

export function TripRouteMap({ live = null, actualTrack = [] }: MapProps) {
  if (!googleMapEnabled()) {
    // Flag off (default): render exactly the same output as before Phase 17.
    // No hooks, no toggle, no Google script ever requested.
    return <MapLibreFrame live={live} actualTrack={actualTrack} />;
  }

  return <TripRouteMapToggle live={live} actualTrack={actualTrack} />;
}
