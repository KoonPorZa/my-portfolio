"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { haversineMeters, type CoordinatePoint } from "@/lib/trip-gps/geo";
import { describeWeather, fetchCurrentWeather, type CurrentWeather, type WeatherTone } from "@/lib/weather";
import styles from "./weather-now.module.css";

type WeatherNowProps = {
  lat: number | null;
  lon: number | null;
};

type WeatherPoint = {
  lat: number;
  lon: number;
};

type WeatherNowState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      data: CurrentWeather;
      point: WeatherPoint;
      updatedAt: string;
      isRefreshing: boolean;
    }
  | { status: "error" };

const MOVE_REFRESH_METERS = 5_000;
const REFRESH_INTERVAL_MS = 10 * 60 * 1_000;

export function WeatherNow({ lat, lon }: WeatherNowProps) {
  const [state, setState] = useState<WeatherNowState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const lastFetchPointRef = useRef<WeatherPoint | null>(null);

  const point = useMemo(() => normalizePoint(lat, lon), [lat, lon]);
  const displayState: WeatherNowState = point ? state : { status: "idle" };

  const loadWeather = useCallback(async (nextPoint: WeatherPoint) => {
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;
    setState((current) => (current.status === "ready" ? { ...current, isRefreshing: true } : { status: "loading" }));

    try {
      const data = await fetchCurrentWeather(nextPoint.lat, nextPoint.lon, controller.signal);

      lastFetchPointRef.current = nextPoint;
      setState({
        status: "ready",
        data,
        point: nextPoint,
        updatedAt: new Date().toISOString(),
        isRefreshing: false,
      });
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      setState((current) => (current.status === "ready" ? { ...current, isRefreshing: false } : { status: "error" }));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    if (!point) {
      abortRef.current?.abort();
      lastFetchPointRef.current = null;
      return;
    }

    const lastPoint = lastFetchPointRef.current;

    if (!lastPoint || haversineMeters(toCoordinatePoint(lastPoint), toCoordinatePoint(point)) >= MOVE_REFRESH_METERS) {
      void loadWeather(point);
    }
  }, [loadWeather, point]);

  useEffect(() => {
    if (!point) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void loadWeather(point);
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [loadWeather, point]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <div>
          <p className={styles.kicker}>อากาศตอนนี้</p>
          <h2 className={styles.title}>จุดพิกัดล่าสุด</h2>
        </div>
        <span className={styles.statusBadge}>{statusLabel(displayState)}</span>
      </div>

      {renderWeatherState(displayState)}
    </section>
  );
}

function renderWeatherState(state: WeatherNowState) {
  if (state.status === "idle") {
    return (
      <div className={cx(styles.stateBox, styles.stateBoxDashed)}>
        <p className={styles.stateTitle}>รอพิกัดล่าสุด</p>
        <p className={styles.stateCopy}>เมื่อมีพิกัดแล้วจะแสดงอุณหภูมิ ลม และฝนตรงตำแหน่งนั้น</p>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className={styles.stateBox}>
        <p className={styles.loadingText}>กำลังอ่าน Open-Meteo…</p>
        <div className={styles.skeletonGrid} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className={cx(styles.stateBox, styles.errorBox)}>
        <p className={styles.stateTitle}>ยังอ่านอากาศไม่ได้</p>
        <p className={styles.stateCopy}>Open-Meteo ไม่ตอบกลับตอนนี้ หน้านี้ยังแสดงตำแหน่งต่อได้ตามปกติ</p>
      </div>
    );
  }

  const description = describeWeather(state.data.code);

  return (
    <>
      <div className={styles.current}>
        <div>
          <p className={cx(styles.condition, toneTextClass(description.tone))}>
            {description.label}
          </p>
          <p className={styles.temperature}>
            {Math.round(state.data.tempC)}
            <span className={styles.temperatureUnit}>°C</span>
          </p>
        </div>
        <span className={styles.weatherIcon} aria-hidden="true">
          {description.icon}
        </span>
      </div>

      <dl className={styles.metrics}>
        <WeatherCell label="รู้สึกเหมือน" value={`${Math.round(state.data.feelsLikeC)}°C`} />
        <WeatherCell label="ความชื้น" value={`${Math.round(state.data.humidity)}%`} />
        <WeatherCell label="ฝนตอนนี้" value={`${formatOneDecimal(state.data.precipMm)} มม.`} />
        <WeatherCell label="ลม" value={`${Math.round(state.data.windKmh)} กม./ชม.`} />
      </dl>

      <p className={styles.meta}>
        อัปเดต {formatThaiTime(state.updatedAt)}
        {state.isRefreshing ? " · กำลังรีเฟรช" : ""} · {state.point.lat.toFixed(4)}, {state.point.lon.toFixed(4)}
      </p>
    </>
  );
}

function WeatherCell({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metricCell}>
      <dt className={styles.metricLabel}>{label}</dt>
      <dd className={styles.metricValue}>{value}</dd>
    </div>
  );
}

function statusLabel(state: WeatherNowState): string {
  if (state.status === "ready" && state.isRefreshing) {
    return "รีเฟรช";
  }

  switch (state.status) {
    case "idle":
      return "รอพิกัด";
    case "loading":
      return "โหลด";
    case "ready":
      return "สด";
    case "error":
      return "เว้นไว้";
  }
}

function toneTextClass(tone: WeatherTone): string {
  switch (tone) {
    case "clear":
      return styles.toneClear;
    case "cloud":
      return styles.toneCloud;
    case "rain":
      return styles.toneRain;
    case "storm":
      return styles.toneStorm;
    case "fog":
      return styles.toneFog;
  }
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function normalizePoint(lat: number | null, lon: number | null): WeatherPoint | null {
  if (
    lat === null ||
    lon === null ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return null;
  }

  return { lat, lon };
}

function toCoordinatePoint(point: WeatherPoint): CoordinatePoint {
  return { lat: point.lat, lng: point.lon };
}

function formatOneDecimal(value: number): string {
  return new Intl.NumberFormat("th-TH", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(value);
}

function formatThaiTime(value: string): string {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "ไม่ทราบเวลา";
  }

  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
