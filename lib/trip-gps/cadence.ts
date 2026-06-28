import type { LocationFreshness, TrackerMode, ViewerState } from "./types";

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;

export const ACTIVE_INTERVAL_MS = 5 * MINUTE_MS;
export const SAVER_INTERVAL_MS = 10 * MINUTE_MS;
export const REST_INTERVAL_MS = 15 * MINUTE_MS;
export const STALE_AFTER_MS = 15 * MINUTE_MS;
export const OFFLINE_AFTER_MS = 30 * MINUTE_MS;
export const MAX_BAD_ACCURACY_M = 250;

export const FRESH_POLL_MS = 60 * SECOND_MS;
export const WAITING_POLL_MS = 30 * SECOND_MS;

export const TRACKER_INTERVAL_MS: Readonly<Record<TrackerMode, number>> = {
  active: ACTIVE_INTERVAL_MS,
  saver: SAVER_INTERVAL_MS,
  rest: REST_INTERVAL_MS,
};

export function intervalForMode(mode: TrackerMode): number {
  return TRACKER_INTERVAL_MS[mode];
}

export function freshnessFor(ageMs: number): LocationFreshness {
  if (!Number.isFinite(ageMs)) {
    return "offline";
  }

  if (ageMs <= STALE_AFTER_MS) {
    return "fresh";
  }

  if (ageMs <= OFFLINE_AFTER_MS) {
    return "stale";
  }

  return "offline";
}

export function nextPollMs(state: ViewerState): number {
  switch (state) {
    case "loading":
    case "waiting-first-gps":
    case "stale":
      return WAITING_POLL_MS;
    case "fresh":
    case "offline":
    case "stopped":
    case "invalid/expired":
      return FRESH_POLL_MS;
  }
}
