"use client";

import { useLiveLocation } from "@/lib/trip-gps/use-live-location";
import styles from "./trip.module.css";

const MODE_LABEL: Record<string, string> = {
  active: "ปกติ",
  saver: "ประหยัดแบต",
  rest: "พัก",
  city: "ในเมือง",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
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
            <a className={styles.liveMapLink} href="/trip/001/live">
              ดูหน้าติดตามสด →
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
