"use client";

import { useEffect, useRef, useState } from "react";

import { stops } from "@/lib/trip-stops";
import { tripGpsApiBase } from "@/lib/trip-gps/api-base";
import { googleMapsBrowserKey } from "@/lib/trip-gps/google-map-config";
import { loadGoogleMaps } from "@/lib/trip-gps/google-maps-loader";
import styles from "./route-map.module.css";

const ROUTE_COLOR = "#cf451c";
const ACTUAL_TRACK_COLOR = "#057f73";
const GOOGLE_ROUTE_PATH = "/api/trips/001/google-route";

type LivePoint = { lat: number; lng: number } | null;
type TrackPoint = { lat: number; lng: number };

type GoogleRouteResponse =
  | {
      fallback: false;
      encodedPolyline: string;
      distanceMeters: number;
      durationSeconds: number;
      source: "google";
      cachedAt: string;
      expiresAt: string;
    }
  | { fallback: true; reason: string };

export function GoogleRouteMap({
  live,
  actualTrack,
  onFallback,
}: {
  live: LivePoint;
  actualTrack: TrackPoint[];
  onFallback: () => void;
}) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const liveMarkerRef = useRef<google.maps.Marker | null>(null);
  const actualTrackRef = useRef<google.maps.Polyline | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const fellBackRef = useRef(false);

  function triggerFallback() {
    if (!fellBackRef.current) {
      fellBackRef.current = true;
      onFallback();
    }
  }

  // Initial load: Google script + route fetch + map init.
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await loadGoogleMaps(googleMapsBrowserKey());
      } catch {
        if (!cancelled) {
          setLoadError("โหลด Google Maps ไม่สำเร็จ");
          triggerFallback();
        }
        return;
      }

      if (cancelled || !mapDivRef.current) return;

      // Fetch planned route from backend.
      let routeData: GoogleRouteResponse;
      try {
        const base = tripGpsApiBase();
        const url = base ? `${base}${GOOGLE_ROUTE_PATH}` : GOOGLE_ROUTE_PATH;
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        const json = (await res.json()) as GoogleRouteResponse;
        routeData = json;
      } catch {
        if (!cancelled) {
          setLoadError("โหลดเส้นทาง Google ไม่สำเร็จ");
          triggerFallback();
        }
        return;
      }

      if (cancelled) return;

      if (routeData.fallback) {
        setLoadError(`เส้นทาง Google ไม่พร้อม: ${routeData.reason}`);
        triggerFallback();
        return;
      }

      // Decode the planned route polyline.
      const plannedPath = google.maps.geometry.encoding.decodePath(
        routeData.encodedPolyline,
      );

      // Build bounds from the planned route.
      const bounds = new google.maps.LatLngBounds();
      for (const pt of plannedPath) bounds.extend(pt);

      // Create the map.
      const map = new google.maps.Map(mapDivRef.current, {
        mapTypeId: "roadmap",
        disableDefaultUI: false,
        gestureHandling: "cooperative",
      });
      mapRef.current = map;

      // Planned route polyline (accent red).
      new google.maps.Polyline({
        path: plannedPath,
        strokeColor: ROUTE_COLOR,
        strokeOpacity: 0.85,
        strokeWeight: 3.5,
        map,
      });

      // Actual GPS track (green) is drawn + kept in sync by the effect below so
      // it updates live as new realtime points arrive (not just at init). Seed
      // the fit bounds with the initial track so the first view frames it.
      for (const pt of actualTrack) {
        if (Number.isFinite(pt.lat) && Number.isFinite(pt.lng)) bounds.extend(pt);
      }

      // Numbered stop markers (trip-stops stores coords as [lat, lng]).
      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        const major = i === 0 || i === stops.length - 1;
        new google.maps.Marker({
          position: { lat: stop.coords[0], lng: stop.coords[1] },
          map,
          label: {
            text: String(i + 1).padStart(2, "0"),
            color: major ? "#fff6f0" : "#a4330f",
            fontSize: "11px",
            fontWeight: "800",
            fontFamily: "ui-monospace, monospace",
          },
          title: stop.name,
        });
        bounds.extend({ lat: stop.coords[0], lng: stop.coords[1] });
      }

      // Live marker.
      if (live) {
        liveMarkerRef.current = new google.maps.Marker({
          position: live,
          map,
          title: "ตำแหน่งสด",
        });
        bounds.extend(live);
      }

      map.fitBounds(bounds, { top: 42, bottom: 52, left: 34, right: 34 });

      if (!cancelled) setMapReady(true);
    }

    void init();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw + keep the actual GPS breadcrumb (green) in sync as realtime points
  // arrive. Runs on the first map-ready tick and on every actualTrack change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (actualTrackRef.current) {
      actualTrackRef.current.setMap(null);
      actualTrackRef.current = null;
    }

    const validTrack = actualTrack.filter(
      (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng),
    );

    if (validTrack.length >= 2) {
      actualTrackRef.current = new google.maps.Polyline({
        path: validTrack,
        strokeColor: ACTUAL_TRACK_COLOR,
        strokeOpacity: 0.95,
        strokeWeight: 4.5,
        map,
      });
    }
  }, [actualTrack, mapReady]);

  // Update live marker position when prop changes after init.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (live) {
      if (liveMarkerRef.current) {
        liveMarkerRef.current.setMap(null);
      }
      liveMarkerRef.current = new google.maps.Marker({
        position: live,
        map,
        title: "ตำแหน่งสด",
      });
    } else if (liveMarkerRef.current) {
      liveMarkerRef.current.setMap(null);
      liveMarkerRef.current = null;
    }
  }, [live]);

  if (loadError) {
    return (
      <div className={styles.mapLoading}>
        {loadError} — กำลังสลับไปแผนที่ปกติ…
      </div>
    );
  }

  return <div ref={mapDivRef} className={styles.map} />;
}
