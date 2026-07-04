"use client";

import { useEffect, useState } from "react";

import { liveStatusCopy, type LiveStatusCopy } from "@/lib/trip-gps/live-status-copy";
import { useLiveLocation } from "@/lib/trip-gps/use-live-location";
import styles from "./trip.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function cardToneClass(copy: LiveStatusCopy): string | null {
  switch (copy.kind) {
    case "live":
      return styles.liveStatusLive;
    case "stale":
      return styles.liveStatusStale;
    case "lost":
      return styles.liveStatusLost;
    case "arrived":
      return styles.liveStatusArrived;
    default:
      return null;
  }
}

function badgeToneClass(copy: LiveStatusCopy): string | null {
  switch (copy.kind) {
    case "stale":
      return styles.liveBadgeStale;
    case "lost":
      return styles.liveBadgeLost;
    case "arrived":
      return styles.liveBadgeArrived;
    default:
      return null;
  }
}

// Status-only banner: the roadbook tells viewers *whether* sharing is on and
// how fresh it is; the actual telemetry (map, coordinates, speed) lives only
// on /trip/001/live.
export function TripLiveStatus() {
  const state = useLiveLocation();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const copy = liveStatusCopy(state, nowMs);
  const showCard = copy.kind === "live" || copy.kind === "stale" || copy.kind === "lost" || copy.kind === "arrived";

  return (
    <section id="live" className={cx(styles.liveStatus, cardToneClass(copy))} aria-live="polite">
      {showCard ? (
        <>
          <div className={styles.liveStatusHead}>
            <span className={cx(styles.liveBadge, badgeToneClass(copy))}>
              {copy.kind === "live" ? <span className={styles.liveBadgeDot} aria-hidden="true" /> : null}
              {copy.badge}
            </span>
            <span className={styles.liveStatusTitle}>{copy.title}</span>
          </div>
          <p className={styles.liveStatusMeta}>{copy.body}</p>
          <div className={styles.liveStatusActions}>
            <a className={styles.liveMapLink} href="/trip/001/live">
              {copy.kind === "arrived" ? "ดูเส้นทางที่วิ่งจริง →" : "ดูหน้าติดตามสด →"}
            </a>
            {copy.kind === "live" ? (
              <span className={styles.liveStatusUpdated}>อัปเดตอัตโนมัติแบบ realtime</span>
            ) : null}
          </div>
        </>
      ) : (
        <p className={styles.liveStatusIdle}>
          <span className={styles.liveIdleDot} aria-hidden="true" />
          {copy.kind === "idle" ? `${copy.title} — ${copy.body}` : copy.title}
        </p>
      )}
    </section>
  );
}
