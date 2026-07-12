"use client";

import { useMemo, useState } from "react";

import type { StopArrival } from "@/lib/trip-gps/types";
import { PLAN_C_TIMED_STOPS } from "@/lib/trip-plan";
import { TRIP_STOP_COUNT } from "@/lib/trip-stops";
import styles from "./trip-progress-timeline.module.css";

type DeltaTone = "rest" | "accent" | "danger" | "muted";

type TimelineControls = {
  active: boolean;
  busyStopIndex: number | null;
  onSetNow(stopIndex: number): void | Promise<void>;
  onSetTime(stopIndex: number, arrivedAt: string): void | Promise<void>;
  onClear(stopIndex: number): void | Promise<void>;
};

type TripProgressTimelineProps = {
  arrivals: StopArrival[];
  controls?: TimelineControls;
  statusMessage?: string | null;
  errorMessage?: string | null;
};

type DeltaCopy = {
  label: string;
  tone: DeltaTone;
};

type BangkokParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

// The planned "แผน" times come from the shared Plan C itinerary so /live and
// /share always match the /trip/001 roadbook (day 1 depart 13:30, overnight at
// หลังสวนเพลส, day 2 depart 05:00). Was buildTimedStops() = the old 04:00 plan.
const TIMED_STOPS = PLAN_C_TIMED_STOPS;
const BANGKOK_OFFSET_HOURS = 7;
const BANGKOK_PARTS_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const BANGKOK_TIME_FORMATTER = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  hour: "2-digit",
  minute: "2-digit",
});

export function TripProgressTimeline({
  arrivals,
  controls,
  statusMessage,
  errorMessage,
}: TripProgressTimelineProps) {
  const [draftTimes, setDraftTimes] = useState<Record<number, string>>({});
  const arrivalsByIndex = useMemo(() => arrivalMap(arrivals), [arrivals]);
  const reachedCount = arrivalsByIndex.size;
  const progressPercent = Math.round((reachedCount / TRIP_STOP_COUNT) * 100);
  const nextStopIndex = TIMED_STOPS.findIndex((_, index) => !arrivalsByIndex.has(index));
  const currentStopIndex = nextStopIndex === -1 ? TRIP_STOP_COUNT - 1 : nextStopIndex;
  const currentStop = TIMED_STOPS[currentStopIndex];
  const currentStopCopy =
    nextStopIndex === -1
      ? "ถึงครบทุกจุดแล้ว"
      : currentStop
        ? `${String(currentStopIndex + 1).padStart(2, "0")} · ${currentStop.name}`
        : "ยังไม่ทราบ";

  return (
    <section className={styles.timeline} aria-labelledby="trip-progress-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Plan / Actual</p>
          <h2 id="trip-progress-title">ไทม์ไลน์การถึงจุดพัก</h2>
        </div>
        <span className={styles.progressBadge}>
          ถึงแล้ว {reachedCount}/{TRIP_STOP_COUNT} จุด
        </span>
      </header>

      <div className={styles.progressTrack} aria-hidden="true">
        <span style={{ width: `${progressPercent}%` }} />
      </div>

      <p className={styles.nextLine}>
        {nextStopIndex === -1 ? (
          "ถึงครบทุกจุดแล้ว"
        ) : (
          <>
            จุดถัดไป <strong>{currentStopCopy}</strong>
          </>
        )}
      </p>

      {statusMessage ? <p className={styles.notice}>{statusMessage}</p> : null}
      {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}

      <ol className={styles.stopList}>
        {TIMED_STOPS.map((stop, index) => {
          const arrival = arrivalsByIndex.get(index) ?? null;
          const delta = arrival ? deltaCopy(stop.arriveMinutes, arrival.arrivedAt) : null;
          const isCurrent = index === currentStopIndex;
          const isBusy = controls?.busyStopIndex === index;
          const inputValue =
            draftTimes[index] ?? (arrival ? timeInputValue(arrival.arrivedAt) : timeInputValue(new Date().toISOString()));

          return (
            <li
              key={stop.name}
              className={cx(
                styles.stopItem,
                arrival && styles.stopReached,
                isCurrent && styles.stopCurrent
              )}
            >
              <span className={styles.stopNo}>{String(index + 1).padStart(2, "0")}</span>

              <div className={styles.stopBody}>
                <div className={styles.stopTop}>
                  <h3>{stop.name}</h3>
                  {isCurrent ? (
                    <span className={styles.currentPill}>
                      {nextStopIndex === -1 ? "ครบเส้นทาง" : "จุดถัดไป"}
                    </span>
                  ) : null}
                </div>

                <p className={styles.stopPlace}>
                  {stop.place} · ~{Math.round(stop.cumulativeKm)} กม.
                </p>

                <p className={styles.timeLine}>
                  <span className={styles.timePlan}>แผน {stop.arrive} น.</span>
                  <span className={styles.timeArrow} aria-hidden="true">
                    →
                  </span>
                  {arrival ? (
                    <span className={styles.timeActual}>ถึงจริง {formatBangkokTime(arrival.arrivedAt)}</span>
                  ) : (
                    <span className={styles.timePending}>ยังไม่ถึง</span>
                  )}
                  {delta ? (
                    <span className={cx(styles.deltaBadge, deltaToneClass(delta.tone))}>{delta.label}</span>
                  ) : null}
                </p>

                {arrival ? (
                  <p className={styles.sourceText}>
                    {arrival.source === "auto" ? "GPS อัตโนมัติ" : "เจ้าของแก้มือ"}
                  </p>
                ) : null}

                {controls ? (
                  <div className={styles.controls} aria-label={`แก้เวลาถึงจริง ${stop.name}`}>
                    {controls.active ? (
                      <>
                        <button
                          className={cx(styles.controlButton, styles.controlPrimary)}
                          type="button"
                          disabled={isBusy}
                          onClick={() => void controls.onSetNow(index)}
                        >
                          {isBusy ? "กำลังบันทึก" : "ถึงแล้ว"}
                        </button>
                        <label className={styles.timeEdit}>
                          <span>เวลาแก้</span>
                          <input
                            type="time"
                            value={inputValue}
                            disabled={isBusy}
                            onChange={(event) =>
                              setDraftTimes((current) => ({
                                ...current,
                                [index]: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <button
                          className={styles.controlButton}
                          type="button"
                          disabled={isBusy || !inputValue}
                          onClick={() => {
                            const arrivedAt = bangkokInputToIso(
                              arrival ? dateKey(arrival.arrivedAt) : dateKey(new Date().toISOString()),
                              inputValue
                            );

                            if (arrivedAt) {
                              void controls.onSetTime(index, arrivedAt);
                            }
                          }}
                        >
                          บันทึกเวลา
                        </button>
                        <button
                          className={cx(styles.controlButton, styles.controlDanger)}
                          type="button"
                          disabled={isBusy || !arrival}
                          onClick={() => void controls.onClear(index)}
                        >
                          ล้าง
                        </button>
                      </>
                    ) : (
                      <p className={styles.controlHint}>เริ่มแชร์ GPS หรือกด “กรอกเวลาเอง” ก่อน แล้วค่อยแก้เวลาถึงจริง</p>
                    )}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function arrivalMap(arrivals: StopArrival[]): Map<number, StopArrival> {
  const map = new Map<number, StopArrival>();

  for (const arrival of arrivals) {
    if (
      Number.isInteger(arrival.index) &&
      arrival.index >= 0 &&
      arrival.index < TRIP_STOP_COUNT &&
      Number.isFinite(Date.parse(arrival.arrivedAt))
    ) {
      map.set(arrival.index, arrival);
    }
  }

  return map;
}

function deltaCopy(plannedMinutes: number, arrivedAt: string): DeltaCopy {
  const actualMinutes = bangkokMinutes(arrivedAt);

  if (actualMinutes === null) {
    return {
      label: "อ่านเวลาไม่ได้",
      tone: "muted",
    };
  }

  let delta = actualMinutes - (plannedMinutes % 1440);

  if (delta > 720) {
    delta -= 1440;
  } else if (delta < -720) {
    delta += 1440;
  }

  if (delta === 0) {
    return {
      label: "ตรงแผน",
      tone: "rest",
    };
  }

  if (delta < 0) {
    return {
      label: `เร็ว ${formatDeltaMinutes(Math.abs(delta))}`,
      tone: "rest",
    };
  }

  return {
    label: `ช้า ${formatDeltaMinutes(delta)}`,
    tone: delta <= 15 ? "accent" : "danger",
  };
}

function formatDeltaMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} นาที`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  return remainder ? `${hours} ชม. ${remainder} นาที` : `${hours} ชม.`;
}

function formatBangkokTime(value: string): string {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "ไม่ทราบเวลา";
  }

  return `${BANGKOK_TIME_FORMATTER.format(date)} น.`;
}

function bangkokMinutes(value: string): number | null {
  const parts = bangkokParts(value);

  return parts ? parts.hour * 60 + parts.minute : null;
}

function timeInputValue(value: string): string {
  const parts = bangkokParts(value);

  if (!parts) {
    return "04:00";
  }

  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

function dateKey(value: string): string {
  const parts = bangkokParts(value);

  if (!parts) {
    return "2026-07-13";
  }

  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function bangkokParts(value: string): BangkokParts | null {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  const parts = BANGKOK_PARTS_FORMATTER.formatToParts(date);
  const year = datePart(parts, "year");
  const month = datePart(parts, "month");
  const day = datePart(parts, "day");
  const hour = datePart(parts, "hour");
  const minute = datePart(parts, "minute");

  if (year === null || month === null || day === null || hour === null || minute === null) {
    return null;
  }

  return {
    year,
    month,
    day,
    hour,
    minute,
  };
}

function datePart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): number | null {
  const value = parts.find((part) => part.type === type)?.value;

  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : null;
}

function bangkokInputToIso(dayKey: string, timeValue: string): string | null {
  const dayParts = dayKey.split("-").map((part) => Number.parseInt(part, 10));
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeValue);

  if (dayParts.length !== 3 || !timeMatch) {
    return null;
  }

  const [year, month, day] = dayParts;
  const hour = Number.parseInt(timeMatch[1] ?? "", 10);
  const minute = Number.parseInt(timeMatch[2] ?? "", 10);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day, hour - BANGKOK_OFFSET_HOURS, minute)).toISOString();
}

function deltaToneClass(tone: DeltaTone): string {
  switch (tone) {
    case "rest":
      return styles.deltaRest;
    case "accent":
      return styles.deltaAccent;
    case "danger":
      return styles.deltaDanger;
    case "muted":
      return styles.deltaMuted;
  }
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
