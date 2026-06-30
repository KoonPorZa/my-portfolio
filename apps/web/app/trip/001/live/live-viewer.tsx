"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TRACKER_MODES,
  type LocationFreshness,
  type LocationLatest,
  type StopArrival,
  type TrackerMode,
  type UploadReason,
  type ViewerState,
} from "@/lib/trip-gps/types";
import { TripProgressTimeline } from "@/components/trip-progress-timeline";
import { WeatherNow } from "@/components/weather-now";
import { buildTimedStops } from "@/lib/trip-stops";
import { tripGpsApiBase } from "@/lib/trip-gps/api-base";
import styles from "./live.module.css";

type ViewerLatestResponse = {
  status: "active" | "stopped";
  freshness: LocationFreshness | null;
  viewerState: ViewerState;
  latest: LocationLatest | null;
  stopArrivals: StopArrival[];
  nextPollMs: number;
  message: string;
};

type LiveViewerProps = {
  token: string;
  fontClassName: string;
};

type StateTone = "green" | "yellow" | "redGray" | "gray";

type StateCopy = {
  badge: string;
  title: string;
  body: string;
  tone: StateTone;
};

const LOCATION_ENDPOINT_PATH = "/api/trips/001/location";
const MIN_POLL_MS = 30_000;
const MAX_POLL_MS = 60_000;
const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

const viewerStates = new Set<ViewerState>([
  "loading",
  "invalid/expired",
  "waiting-first-gps",
  "fresh",
  "stale",
  "offline",
  "stopped",
]);

const freshnessValues = new Set<LocationFreshness>(["fresh", "stale", "offline"]);
const trackerModes = new Set<TrackerMode>(TRACKER_MODES);
const uploadReasons = new Set<UploadReason>(["scheduled", "manual", "start", "stop", "retry"]);
const routeStops = buildTimedStops();
const routeTotalKm = Math.round(routeStops.at(-1)?.cumulativeKm ?? 0);

const stateCopy: Record<ViewerState, StateCopy> = {
  loading: {
    badge: "กำลังโหลด",
    title: "กำลังตรวจสอบลิงก์",
    body: "กำลังเรียกตำแหน่งล่าสุดจากเซิร์ฟเวอร์",
    tone: "gray",
  },
  "invalid/expired": {
    badge: "ลิงก์ใช้ไม่ได้",
    title: "โทเคนไม่ถูกต้องหรือหมดอายุ",
    body: "เปิดลิงก์ใหม่จากเจ้าของทริป หน้านี้จะไม่แสดงพิกัดเมื่อโทเคนไม่ผ่าน",
    tone: "redGray",
  },
  "waiting-first-gps": {
    badge: "รอ GPS",
    title: "ยังไม่มีตำแหน่งแรก",
    body: "ผู้ขี่ยังไม่ได้ส่งจุด GPS แรก หรือเพิ่งเริ่มแชร์ตำแหน่ง",
    tone: "yellow",
  },
  fresh: {
    badge: "สด",
    title: "ตำแหน่งล่าสุดยังสด",
    body: "ข้อมูลนี้เพิ่งรับเข้าระบบและยังอยู่ในช่วงติดตามได้",
    tone: "green",
  },
  stale: {
    badge: "เริ่มเก่า",
    title: "ตำแหน่งล่าสุด (last known)",
    body: "ข้อมูลเกิน 15 นาทีแล้ว ใช้เป็นจุดล่าสุดเท่านั้น ไม่ใช่ตำแหน่งสด",
    tone: "yellow",
  },
  offline: {
    badge: "ขาดสัญญาณ",
    title: "ตำแหน่งล่าสุด (last known)",
    body: "ข้อมูลเกิน 30 นาทีแล้ว อาจอยู่ในจุดอับสัญญาณ แบตหมด หรือหยุดส่งตำแหน่ง",
    tone: "redGray",
  },
  stopped: {
    badge: "หยุดแชร์",
    title: "การแชร์ตำแหน่งหยุดแล้ว",
    body: "เจ้าของทริปหยุดเซสชันแล้ว หน้านี้จะไม่ polling ต่อโดยอัตโนมัติ",
    tone: "redGray",
  },
};

export function LiveViewer({ token, fontClassName }: LiveViewerProps) {
  const [viewerState, setViewerState] = useState<ViewerState>("loading");
  const [latestResponse, setLatestResponse] = useState<ViewerLatestResponse | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [nextDelayMs, setNextDelayMs] = useState(MAX_POLL_MS);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const abortRef = useRef<AbortController | null>(null);

  const fetchLatest = useCallback(async () => {
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;
    setIsRefreshing(true);

    try {
      const response = await fetch(`${locationEndpoint()}?t=${encodeURIComponent(token)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await readJson(response);
      const checkedAt = new Date().toISOString();

      if (!response.ok) {
        setLatestResponse(null);
        setViewerState("invalid/expired");
        setErrorMessage(errorCopy(body, response.status));
        setLastCheckedAt(checkedAt);
        setNextDelayMs(MAX_POLL_MS);
        return;
      }

      const payload = coerceViewerResponse(body);

      if (!payload) {
        setLatestResponse(null);
        setViewerState("offline");
        setErrorMessage("รูปแบบข้อมูลจากเซิร์ฟเวอร์ไม่ถูกต้อง กรุณาลองรีเฟรชอีกครั้ง");
        setLastCheckedAt(checkedAt);
        setNextDelayMs(MAX_POLL_MS);
        return;
      }

      setLatestResponse(payload);
      setViewerState(payload.viewerState);
      setErrorMessage(null);
      setLastCheckedAt(checkedAt);
      setNextDelayMs(clampPoll(payload.nextPollMs));
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      setErrorMessage("เชื่อมต่อข้อมูลตำแหน่งไม่ได้ กรุณารีเฟรชหรือลองใหม่ภายหลัง");
      setLastCheckedAt(new Date().toISOString());
      setNextDelayMs(MAX_POLL_MS);
      setViewerState((current) => (current === "loading" ? "offline" : current));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsRefreshing(false);
      }
    }
  }, [token]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchLatest();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      abortRef.current?.abort();
    };
  }, [fetchLatest]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 30_000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!lastCheckedAt || !shouldAutoPoll(viewerState)) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      void fetchLatest();
    }, clampPoll(nextDelayMs));

    return () => window.clearTimeout(timeoutId);
  }, [fetchLatest, lastCheckedAt, nextDelayMs, viewerState]);

  const latest = latestResponse?.latest ?? null;
  const stopArrivals = latestResponse?.stopArrivals ?? [];
  const descriptor = stateCopy[viewerState];
  const badgeClassName = cx(styles.badge, badgeToneClass(descriptor.tone));
  const latestAgeMs = latest ? ageFromServer(latest.serverTs, nowMs) : null;
  const mapsHref = latest ? googleMapsLink(latest.lat, latest.lng) : null;
  const autoPolling = shouldAutoPoll(viewerState);
  const latestTitle = viewerState === "stale" || viewerState === "offline" ? "ตำแหน่งล่าสุด (last known)" : "ตำแหน่งล่าสุด";

  const statusRows = useMemo(
    () => [
      ["สถานะเซสชัน", latestResponse ? sessionStatusCopy(latestResponse.status) : "กำลังตรวจสอบ"],
      ["ตรวจล่าสุด", lastCheckedAt ? formatTimestamp(lastCheckedAt) : "ยังไม่ได้ตรวจ"],
      ["รอบ polling", autoPolling ? `${formatDuration(clampPoll(nextDelayMs))}` : "หยุดอัตโนมัติ"],
    ],
    [autoPolling, lastCheckedAt, latestResponse, nextDelayMs]
  );

  return (
    <main className={cx(styles.liveRoot, fontClassName)}>
      <div className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.heroTop}>
            <span className={styles.kicker}>Trip 01 · Live Viewer</span>
            <span className={badgeClassName}>{descriptor.badge}</span>
          </div>
          <h1 className={styles.heroTitle}>
            สงขลา<span>→</span>กรุงเทพฯ
          </h1>
          <p className={styles.heroLead}>
            หน้าอ่านอย่างเดียวสำหรับดูตำแหน่งล่าสุดของผู้ขี่ ใช้โทเคนผู้ชมกับ API เท่านั้น
            และไม่มีปุ่มควบคุมหรือข้อมูลโทเคนเจ้าของทริป
          </p>
        </header>

        <section className={styles.statusPanel} aria-labelledby="viewer-state-title" aria-live="polite">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>GPS state</p>
              <h2 id="viewer-state-title">{descriptor.title}</h2>
            </div>
            <button className={styles.refreshButton} type="button" onClick={() => void fetchLatest()} disabled={isRefreshing}>
              {isRefreshing ? "กำลังรีเฟรช" : "รีเฟรช"}
            </button>
          </div>

          <p className={styles.stateCopy}>{descriptor.body}</p>

          <dl className={styles.statusGrid}>
            {statusRows.map(([label, value]) => (
              <div key={label} className={styles.statusCell}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>

          {errorMessage ? <p className={styles.errorLine}>{errorMessage}</p> : null}
        </section>

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

            {latest ? (
              <>
                <dl className={styles.pointGrid}>
                  <div className={styles.pointWide}>
                    <dt>พิกัดล่าสุด</dt>
                    <dd>
                      {latest.lat.toFixed(6)}, {latest.lng.toFixed(6)}
                    </dd>
                  </div>
                  <div>
                    <dt>อายุตำแหน่ง</dt>
                    <dd>{latestAgeMs === null ? "ไม่ทราบ" : formatAge(latestAgeMs)}</dd>
                  </div>
                  <div>
                    <dt>เวลาเครื่องผู้ขี่</dt>
                    <dd>{formatTimestamp(latest.clientTs)}</dd>
                  </div>
                  <div>
                    <dt>เวลารับเข้าระบบ</dt>
                    <dd>{formatTimestamp(latest.serverTs)}</dd>
                  </div>
                  <div>
                    <dt>ความแม่นยำ</dt>
                    <dd>±{Math.round(latest.accuracyM)} ม.</dd>
                  </div>
                  {typeof latest.speedMps === "number" ? (
                    <div>
                      <dt>ความเร็วโดยประมาณ</dt>
                      <dd>{Math.round(latest.speedMps * 3.6)} กม./ชม.</dd>
                    </div>
                  ) : null}
                </dl>

                {viewerState === "stale" || viewerState === "offline" ? (
                  <p className={styles.lastKnownWarning}>จุดนี้คือ last known location เท่านั้น อย่าใช้ตีความว่าเป็นตำแหน่งสด</p>
                ) : null}
              </>
            ) : (
              <div className={styles.emptyPoint}>
                <p>ยังไม่มีพิกัดให้แสดง</p>
                <span>เมื่อ API ได้รับ GPS จุดแรก หน้านี้จะแสดงพิกัด เวลา อายุ ความแม่นยำ และลิงก์ Google Maps</span>
              </div>
            )}
          </section>

          {latest ? <WeatherNow lat={latest.lat} lon={latest.lng} /> : null}
        </div>

        <TripProgressTimeline arrivals={stopArrivals} />

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

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function badgeToneClass(tone: StateTone): string {
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

function shouldAutoPoll(state: ViewerState): boolean {
  return state !== "invalid/expired" && state !== "stopped";
}

function clampPoll(ms: number): number {
  if (!Number.isFinite(ms)) {
    return MAX_POLL_MS;
  }

  return Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, Math.round(ms)));
}

function googleMapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function locationEndpoint(): string {
  const base = tripGpsApiBase();

  return base ? `${base}${LOCATION_ENDPOINT_PATH}` : LOCATION_ENDPOINT_PATH;
}

function ageFromServer(serverTs: string, nowMs: number): number | null {
  const ts = Date.parse(serverTs);

  if (!Number.isFinite(ts)) {
    return null;
  }

  return Math.max(0, nowMs - ts);
}

function formatTimestamp(value: string): string {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "ไม่ทราบเวลา";
  }

  // Note: dateStyle/timeStyle cannot be combined with timeZoneName (throws
  // "Invalid option"), so use explicit components to keep the tz abbreviation.
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function formatAge(ageMs: number): string {
  if (ageMs < MINUTE_MS) {
    return "น้อยกว่า 1 นาที";
  }

  if (ageMs < HOUR_MS) {
    return `${Math.floor(ageMs / MINUTE_MS)} นาที`;
  }

  const hours = Math.floor(ageMs / HOUR_MS);
  const minutes = Math.floor((ageMs % HOUR_MS) / MINUTE_MS);

  return minutes > 0 ? `${hours} ชม. ${minutes} นาที` : `${hours} ชม.`;
}

function formatDuration(ms: number): string {
  return `${Math.round(ms / SECOND_MS)} วินาที`;
}

function sessionStatusCopy(status: ViewerLatestResponse["status"]): string {
  return status === "active" ? "กำลังแชร์" : "หยุดแชร์แล้ว";
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorCopy(body: unknown, status: number): string {
  if (status === 401 || status === 403) {
    return "โทเคนผู้ชมไม่ถูกต้อง หมดอายุ หรือถูกยกเลิก";
  }

  if (isRecord(body) && typeof body.message === "string" && body.message.trim()) {
    return body.message;
  }

  return "ตรวจสอบตำแหน่งล่าสุดไม่สำเร็จ กรุณาลองใหม่";
}

function coerceViewerResponse(value: unknown): ViewerLatestResponse | null {
  if (!isRecord(value)) {
    return null;
  }

  const status = value.status === "active" || value.status === "stopped" ? value.status : null;
  const freshness = coerceFreshness(value.freshness);
  const viewerState = coerceViewerState(value.viewerState);
  const latest = value.latest === null ? null : coerceLatest(value.latest);
  const stopArrivals = coerceStopArrivals(value.stopArrivals);
  const nextPollMs = typeof value.nextPollMs === "number" ? clampPoll(value.nextPollMs) : MAX_POLL_MS;
  const message = typeof value.message === "string" ? value.message : "";

  if (!status || !viewerState) {
    return null;
  }

  return {
    status,
    freshness,
    viewerState,
    latest,
    stopArrivals,
    nextPollMs,
    message,
  };
}

function coerceStopArrivals(value: unknown): StopArrival[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.index !== "number" ||
      !Number.isInteger(entry.index) ||
      typeof entry.arrivedAt !== "string" ||
      !Number.isFinite(Date.parse(entry.arrivedAt)) ||
      (entry.source !== "auto" && entry.source !== "manual")
    ) {
      return [];
    }

    return [
      {
        index: entry.index,
        arrivedAt: entry.arrivedAt,
        source: entry.source,
      },
    ];
  });
}

function coerceLatest(value: unknown): LocationLatest | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.lat !== "number" ||
    typeof value.lng !== "number" ||
    typeof value.accuracyM !== "number" ||
    typeof value.clientTs !== "string" ||
    typeof value.serverTs !== "string"
  ) {
    return null;
  }

  if (!Number.isFinite(value.lat) || !Number.isFinite(value.lng) || !Number.isFinite(value.accuracyM)) {
    return null;
  }

  return {
    lat: value.lat,
    lng: value.lng,
    accuracyM: value.accuracyM,
    speedMps: coerceNullableNumber(value.speedMps),
    headingDeg: coerceNullableNumber(value.headingDeg),
    mode: coerceTrackerMode(value.mode),
    reason: coerceUploadReason(value.reason),
    clientTs: value.clientTs,
    serverTs: value.serverTs,
  };
}

function coerceFreshness(value: unknown): LocationFreshness | null {
  if (value === null) {
    return null;
  }

  return typeof value === "string" && freshnessValues.has(value as LocationFreshness) ? (value as LocationFreshness) : null;
}

function coerceViewerState(value: unknown): ViewerState | null {
  return typeof value === "string" && viewerStates.has(value as ViewerState) ? (value as ViewerState) : null;
}

function coerceTrackerMode(value: unknown): TrackerMode | undefined {
  return typeof value === "string" && trackerModes.has(value as TrackerMode) ? (value as TrackerMode) : undefined;
}

function coerceUploadReason(value: unknown): UploadReason | undefined {
  return typeof value === "string" && uploadReasons.has(value as UploadReason) ? (value as UploadReason) : undefined;
}

function coerceNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
