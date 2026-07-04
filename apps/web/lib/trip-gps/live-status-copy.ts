import type { StopArrival } from "@/lib/trip-gps/types";
import type { LiveState } from "@/lib/trip-gps/use-live-location";
import { stops, TRIP_STOP_COUNT } from "@/lib/trip-stops";

// Shared status copy for the roadbook live banner (/trip/001) and the public
// live viewer (/trip/001/live) so wording, age tiers, and the trip-finished
// state stay in sync between the two pages.

export type LiveStatusTone = "green" | "yellow" | "redGray" | "gray";

export type LiveStatusKind =
  | "live"
  | "stale"
  | "lost"
  | "arrived"
  | "idle"
  | "connecting"
  | "unavailable";

export type LiveStatusCopy = {
  kind: LiveStatusKind;
  badge: string;
  title: string;
  body: string;
  tone: LiveStatusTone;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const STALE_AGE_MS = 15 * MINUTE_MS;
export const LOST_AGE_MS = 30 * MINUTE_MS;

const FINISH_STOP_NAME = stops[TRIP_STOP_COUNT - 1]?.name ?? "จุดสุดท้าย";

const BANGKOK_TIME = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  hour: "2-digit",
  minute: "2-digit",
});

export function locationAgeMs(serverTs: string | null, nowMs: number): number | null {
  if (!serverTs) {
    return null;
  }

  const ts = Date.parse(serverTs);

  return Number.isFinite(ts) ? Math.max(0, nowMs - ts) : null;
}

export function formatAge(ms: number): string {
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

// The trip counts as finished once the final stop has an arrival record —
// that survives the session ending, unlike the live location row.
export function finishArrival(stopArrivals: StopArrival[]): StopArrival | null {
  return stopArrivals.find((arrival) => arrival.index === TRIP_STOP_COUNT - 1) ?? null;
}

export function liveStatusCopy(state: LiveState, nowMs: number): LiveStatusCopy {
  if (state.status === "live") {
    const ageMs = locationAgeMs(state.loc.serverTs, nowMs);

    if (ageMs !== null && ageMs >= LOST_AGE_MS) {
      return {
        kind: "lost",
        badge: "ขาดสัญญาณ",
        title: `ตำแหน่งล่าสุดเมื่อ ${formatAge(ageMs)}ที่แล้ว`,
        body: "อาจอยู่จุดอับสัญญาณ แบตหมด หรือหยุดส่งตำแหน่งชั่วคราว — ไม่ได้แปลว่าเลิกแชร์",
        tone: "redGray",
      };
    }

    if (ageMs !== null && ageMs >= STALE_AGE_MS) {
      return {
        kind: "stale",
        badge: "เริ่มเก่า",
        title: `ตำแหน่งล่าสุดเมื่อ ${formatAge(ageMs)}ที่แล้ว`,
        body: "ข้อมูลเกิน 15 นาทีแล้ว ใช้เป็นจุดล่าสุดเท่านั้น ไม่ใช่ตำแหน่งสด",
        tone: "yellow",
      };
    }

    return {
      kind: "live",
      badge: "LIVE",
      title: "กำลังแชร์ตำแหน่งสด",
      body: "หน้านี้อัปเดตเองแบบ realtime เมื่อมีตำแหน่งใหม่ ไม่ต้องรีเฟรช",
      tone: "green",
    };
  }

  const arrived = finishArrival(state.stopArrivals);

  if (state.status === "idle" && arrived) {
    const arrivedMs = Date.parse(arrived.arrivedAt);
    const timeText = Number.isFinite(arrivedMs) ? ` เวลา ${BANGKOK_TIME.format(new Date(arrivedMs))} น.` : "";

    return {
      kind: "arrived",
      badge: "ถึงแล้ว",
      title: "ถึงปลายทางแล้ว",
      body: `จบทริปเรียบร้อย — ถึง ${FINISH_STOP_NAME}${timeText}`,
      tone: "green",
    };
  }

  if (state.status === "unavailable") {
    return {
      kind: "unavailable",
      badge: "ไม่พร้อม",
      title: "ยังไม่ได้ตั้งค่าการติดตามสด",
      body: "ระบบ realtime ยังไม่พร้อมใช้งานในตอนนี้",
      tone: "redGray",
    };
  }

  if (state.status === "connecting") {
    return {
      kind: "connecting",
      badge: "กำลังเชื่อมต่อ",
      title: "กำลังเชื่อมต่อ",
      body: "กำลังตรวจสอบว่ามีการแชร์ตำแหน่งอยู่หรือไม่",
      tone: "gray",
    };
  }

  return {
    kind: "idle",
    badge: "ยังไม่แชร์",
    title: "ยังไม่มีการแชร์ตำแหน่งตอนนี้",
    body: "หน้านี้จะขึ้นเองแบบ realtime เมื่อเจ้าของทริปเริ่มแชร์ — ไม่ต้องรีเฟรช",
    tone: "gray",
  };
}
