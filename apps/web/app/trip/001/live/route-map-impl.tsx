"use client";

import { useEffect } from "react";

import {
  Map,
  MapControls,
  MapMarker,
  MapRoute,
  MarkerContent,
  useMap,
} from "@/components/ui/map";
import { stops } from "@/lib/trip-stops";
import { ROUTE_ROAD_GEOMETRY } from "@/lib/trip-route-geometry";
import styles from "./route-map.module.css";

// mapcn's default free CARTO basemap (no API key). Positron is a light style
// that sits well under the warm roadbook palette.
const CARTO_LIGHT = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const ROUTE_COLOR = "#cf451c";
const ACTUAL_TRACK_COLOR = "#057f73";

// trip-stops stores coords as [lat, lng]; MapLibre / GeoJSON expect [lng, lat].
const routeCoords: [number, number][] = stops.map(({ coords }) => [coords[1], coords[0]]);
const mapBoundsCoords = ROUTE_ROAD_GEOMETRY.length > 0 ? ROUTE_ROAD_GEOMETRY : routeCoords;

type LivePoint = { lat: number; lng: number } | null;
type TrackPoint = { lat: number; lng: number };

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/**
 * Frames the full route once the style has loaded. Depends only on `isLoaded`
 * (not on `live`) so incoming live updates never yank the viewport.
 */
function FitToRoute({ live }: { live: LivePoint }) {
  const { map, isLoaded } = useMap();

  useEffect(() => {
    if (!map || !isLoaded) return;

    const points = live ? [...mapBoundsCoords, [live.lng, live.lat] as [number, number]] : mapBoundsCoords;
    const lngs = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);

    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: { top: 42, bottom: 52, left: 34, right: 34 }, duration: 0, maxZoom: 13 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isLoaded]);

  return null;
}

export function RouteMapImpl({
  live,
  actualTrack,
}: {
  live: LivePoint;
  actualTrack: TrackPoint[];
}) {
  const actualTrackCoords = actualTrack
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
    .map((point): [number, number] => [point.lng, point.lat]);

  return (
    <Map
      className={styles.map}
      theme="light"
      styles={{ light: CARTO_LIGHT, dark: CARTO_LIGHT }}
      dragRotate={false}
    >
      <FitToRoute live={live} />

      <MapRoute coordinates={ROUTE_ROAD_GEOMETRY} color={ROUTE_COLOR} width={3.25} opacity={0.42} />

      {actualTrackCoords.length >= 2 ? (
        <MapRoute
          id="actual-trip-track"
          coordinates={actualTrackCoords}
          color={ACTUAL_TRACK_COLOR}
          width={4.25}
          opacity={0.95}
        />
      ) : null}

      {stops.map((stop, index) => {
        const major = index === 0 || index === stops.length - 1;
        return (
          <MapMarker key={stop.name} longitude={stop.coords[1]} latitude={stop.coords[0]}>
            <MarkerContent className={cx(styles.stopPin, major && styles.stopPinMajor)}>
              {String(index + 1).padStart(2, "0")}
            </MarkerContent>
          </MapMarker>
        );
      })}

      {live ? (
        <MapMarker longitude={live.lng} latitude={live.lat}>
          <MarkerContent className={styles.livePin}>
            <span className={styles.livePinRing} aria-hidden="true" />
            <span className={styles.livePinDot} aria-hidden="true" />
          </MarkerContent>
        </MapMarker>
      ) : null}

      <MapControls position="bottom-right" showZoom showFullscreen />
    </Map>
  );
}
