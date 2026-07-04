"use client";

import { useEffect, useState } from "react";

import { TripProgressTimeline } from "@/components/trip-progress-timeline";
import { WeatherNow } from "@/components/weather-now";
import { TRIP_DIRECTIONS_URL } from "@/lib/trip-stops";
import {
  formatAge,
  liveStatusCopy,
  locationAgeMs,
  type LiveStatusTone,
} from "@/lib/trip-gps/live-status-copy";
import { useLiveLocation } from "@/lib/trip-gps/use-live-location";
import { TripRouteMap } from "./route-map";
import styles from "./live.module.css";

const MODE_LABEL: Record<string, string> = {
  active: "ปกติ",
  saver: "ประหยัดแบต",
  rest: "พัก",
  city: "ในเมือง",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function mapsLink(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function badgeToneClass(tone: LiveStatusTone): string {
  switch (tone) {
    case "green":
      return styles.badgeGreen;
    case "yellow":
      return styles.badgeYellow;
    case "redGray":
      return styles.badgeRedGray;
    case "gray":
      return styles.badgeGray;
  }
}

export function PublicLiveViewer({ fontClassName }: { fontClassName: string }) {
  const state = useLiveLocation();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const live = state.status === "live" ? state.loc : null;
  const track = state.track;
  const stopArrivals = state.stopArrivals;
  const copy = liveStatusCopy(state, nowMs);
  const ageMs = live ? locationAgeMs(live.serverTs, nowMs) : null;
  const mapsHref = live ? mapsLink(live.lat, live.lng) : null;
  const latestTitle = copy.kind === "stale" || copy.kind === "lost" ? "ตำแหน่งล่าสุด (last known)" : "ตำแหน่งล่าสุด";

  return (
    <main className={cx(styles.liveRoot, fontClassName)}>
      <div className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.heroTop}>
            <span className={styles.kicker}>Trip 01 · Live Viewer</span>
            <span className={cx(styles.badge, badgeToneClass(copy.tone))}>{copy.badge}</span>
          </div>
          <h1 className={styles.heroTitle}>
            สงขลา<span>→</span>กรุงเทพฯ
          </h1>
          <p className={styles.heroLead} aria-live="polite">
            <strong>{copy.title}</strong> — {copy.body}
          </p>
        </header>

        <section className={styles.routePanel} aria-labelledby="route-map-title">
          <header className={styles.routeHeader}>
            <div>
              <p className={styles.eyebrow}>Route map</p>
              <h2 id="route-map-title">แผนที่เส้นทาง</h2>
            </div>
            <a className={styles.mapButton} href={TRIP_DIRECTIONS_URL} target="_blank" rel="noreferrer">
              เปิดเส้นทางใน Google Maps
            </a>
          </header>
          <TripRouteMap live={live ? { lat: live.lat, lng: live.lng } : null} actualTrack={track} />
        </section>

        <TripProgressTimeline arrivals={stopArrivals} />

        <div className={styles.locationGrid}>
          <section className={styles.pointPanel} aria-labelledby="latest-point-title">
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Latest point</p>
                <h2 id="latest-point-title">{latestTitle}</h2>
              </div>
              {mapsHref ? (
                <a className={styles.mapButton} href={mapsHref} target="_blank" rel="noreferrer">
                  เปิดใน Google Maps
                </a>
              ) : (
                <span className={styles.mapButtonDisabled}>ยังไม่มีพิกัด</span>
              )}
            </div>

            {live ? (
              <dl className={styles.pointGrid}>
                <div className={styles.pointWide}>
                  <dt>พิกัดล่าสุด</dt>
                  <dd>
                    {live.lat.toFixed(6)}, {live.lng.toFixed(6)}
                  </dd>
                </div>
                <div>
                  <dt>อายุตำแหน่ง</dt>
                  <dd>{ageMs === null ? "ไม่ทราบ" : formatAge(ageMs)}</dd>
                </div>
                {live.accuracyM != null ? (
                  <div>
                    <dt>ความแม่นยำ</dt>
                    <dd>±{Math.round(live.accuracyM)} ม.</dd>
                  </div>
                ) : null}
                {live.speedMps != null ? (
                  <div>
                    <dt>ความเร็วโดยประมาณ</dt>
                    <dd>{Math.round(live.speedMps * 3.6)} กม./ชม.</dd>
                  </div>
                ) : null}
                {MODE_LABEL[live.mode] ? (
                  <div>
                    <dt>โหมด</dt>
                    <dd>{MODE_LABEL[live.mode]}</dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <div className={styles.emptyPoint}>
                <p>ยังไม่มีพิกัดให้แสดง</p>
                <span>เมื่อเจ้าของทริปเริ่มแชร์ หน้านี้จะแสดงพิกัด อายุ ความแม่นยำ และลิงก์ Google Maps แบบ realtime</span>
              </div>
            )}
          </section>

          {live ? <WeatherNow lat={live.lat} lon={live.lng} /> : null}
        </div>
      </div>
    </main>
  );
}
