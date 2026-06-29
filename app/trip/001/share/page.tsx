import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai, IBM_Plex_Mono } from "next/font/google";

import { isGpsEnabled } from "@/lib/trip-gps/config";

import tripStyles from "../trip.module.css";
import { LiveTracker } from "./live-tracker";
import styles from "./share.module.css";

const sans = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--trip-font-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--trip-font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Trip 01 — แชร์ตำแหน่งสด",
  description: "หน้าเจ้าของทริปสำหรับเริ่มและควบคุมการแชร์ตำแหน่งสดของ Trip 01.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f3ecdd",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function Trip01SharePage() {
  const gpsEnabled = isGpsEnabled();

  return (
    <main className={cx(tripStyles.tripRoot, `${sans.variable} ${mono.variable}`)}>
      <div className={cx(tripStyles.tripPage, styles.sharePage)}>
        <header className={styles.shareHeader}>
          <p className={styles.kicker}>Trip 01 · Owner</p>
          <h1>Trip 01 · แชร์ตำแหน่งสด</h1>
          <p>หน้านี้สำหรับเจ้าของทริปใช้เริ่ม หยุด และจัดการลิงก์ตำแหน่งสดโดยตรง</p>
        </header>

        {gpsEnabled ? (
          <LiveTracker gpsEnabled={gpsEnabled} />
        ) : (
          <section className={styles.disabledNotice} role="status" aria-labelledby="gps-disabled-title">
            <h2 id="gps-disabled-title">ยังไม่เปิดแชร์ GPS</h2>
            <p>ระบบแชร์ตำแหน่งสดยังไม่ถูกเปิดใช้งานสำหรับทริปนี้</p>
          </section>
        )}
      </div>
    </main>
  );
}
