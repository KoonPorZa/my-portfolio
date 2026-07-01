"use client";

import { useEffect, useState } from "react";

import { WeatherNow } from "@/components/weather-now";
import { buildTimedStops } from "@/lib/trip-stops";
import { useLiveLocation } from "@/lib/trip-gps/use-live-location";
import styles from "./live.module.css";

const routeStops = buildTimedStops();
const routeTotalKm = Math.round(routeStops.at(-1)?.cumulativeKm ?? 0);
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

const MODE_LABEL: Record<string, string> = {
  active: "ปกติ",
  saver: "ประหยัดแบต",
  rest: "พัก",
  city: "ในเมือง",
};

type Tone = "green" | "yellow" | "redGray" | "gray";
type Copy = { badge: string; title: string; body: string; tone: Tone };

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function mapsLink(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function ageMsFrom(serverTs: string | null, nowMs: number): number | null {
  if (!serverTs) {
    return null;
  }
  const ts = Date.parse(serverTs);
  return Number.isFinite(ts) ? Math.max(0, nowMs - ts) : null;
}

function formatAge(ms: number): string {
  if (ms < MINUTE_MS) {
    return "น้อยกว่า 1 นาที";
  }
  if (ms < HOUR_MS) {
    return `${Math.floor(ms / MINUTE_MS)} นาที`;
  }
  const hours = Math.floor(ms / HOUR_MS);
  const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS);
  return minutes > 0 ? `${hours} ชม. ${minutes} นาที` : `${hours} ชม.`;
}

function badgeToneClass(tone: Tone): string {
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
  const ageMs = live ? ageMsFrom(live.serverTs, nowMs) : null;
  const mapsHref = live ? mapsLink(live.lat, live.lng) : null;

  let copy: Copy;
  if (live) {
    if (ageMs != null && ageMs >= 30 * MINUTE_MS) {
      copy = { badge: "ขาดสัญญาณ", title: "ตำแหน่งล่าสุด (last known)", body: "ข้อมูลเกิน 30 นาที อาจอยู่จุดอับสัญญาณ แบตหมด หรือหยุดส่งตำแหน่ง", tone: "redGray" };
    } else if (ageMs != null && ageMs >= 15 * MINUTE_MS) {
      copy = { badge: "เริ่มเก่า", title: "ตำแหน่งล่าสุด (last known)", body: "ข้อมูลเกิน 15 นาทีแล้ว ใช้เป็นจุดล่าสุดเท่านั้น ไม่ใช่ตำแหน่งสด", tone: "yellow" };
    } else {
      copy = { badge: "สด", title: "กำลังแชร์ตำแหน่งสด", body: "รับตำแหน่งแบบ realtime — หน้านี้อัปเดตเองเมื่อมีจุดใหม่ ไม่ต้องรีเฟรช", tone: "green" };
    }
  } else if (state.status === "unavailable") {
    copy = { badge: "ไม่พร้อม", title: "ยังไม่ได้ตั้งค่าการติดตามสด", body: "ระบบ realtime ยังไม่พร้อมใช้งานในตอนนี้", tone: "redGray" };
  } else if (state.status === "connecting") {
    copy = { badge: "กำลังเชื่อมต่อ", title: "กำลังเชื่อมต่อ", body: "กำลังตรวจสอบว่ามีการแชร์ตำแหน่งอยู่หรือไม่", tone: "gray" };
  } else {
    copy = { badge: "ยังไม่แชร์", title: "ยังไม่มีการแชร์ตำแหน่งตอนนี้", body: "หน้านี้จะขึ้นเองแบบ realtime เมื่อเจ้าของทริปเริ่มแชร์ — ไม่ต้องรีเฟรช", tone: "gray" };
  }

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
          <p className={styles.heroLead}>
            ติดตามตำแหน่งสดแบบ realtime — หน้านี้อัปเดตเองเมื่อเจ้าของทริปแชร์ ไม่ต้องรีเฟรชและไม่ต้องใช้ลิงก์ลับ
          </p>
        </header>

        <section className={styles.statusPanel} aria-labelledby="viewer-state-title" aria-live="polite">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>GPS state</p>
              <h2 id="viewer-state-title">{copy.title}</h2>
            </div>
          </div>
          <p className={styles.stateCopy}>{copy.body}</p>
        </section>

        <div className={styles.locationGrid}>
          <section className={styles.pointPanel} aria-labelledby="latest-point-title">
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Latest point</p>
                <h2 id="latest-point-title">{live ? copy.title : "ตำแหน่งล่าสุด"}</h2>
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

        <section className={styles.routePanel} aria-labelledby="route-title">
          <header className={styles.routeHeader}>
            <div>
              <p className={styles.eyebrow}>Route stops</p>
              <h2 id="route-title">สรุปจุดพักหลัก</h2>
            </div>
            <dl className={styles.routeStats}>
              <div>
                <dt>รวม</dt>
                <dd>~{routeTotalKm.toLocaleString("th-TH")} กม.</dd>
              </div>
              <div>
                <dt>จุดพัก</dt>
                <dd>{routeStops.length} จุด</dd>
              </div>
            </dl>
          </header>

          <ol className={styles.stopList}>
            {routeStops.map((stop, index) => (
              <li key={stop.name} className={styles.stopItem}>
                <span className={styles.stopNo}>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{stop.name}</h3>
                  <p>{stop.place}</p>
                  <span>{stop.role}</span>
                </div>
                <strong>~{Math.round(stop.cumulativeKm)} กม.</strong>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
