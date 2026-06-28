# Phase 3 — Location domain utilities

**Priority:** P0 · **Branch:** `feat/gps` · **Depends on:** Phase 1
**Read first:** `phase-00-overview.md` (cadence constants, data contract)

## Goal
Extract all testable, UI-free logic into `lib/trip-gps/` so the panel, API, and viewer
share one source of truth and the client bundle stays small.

## Files
- **create** `lib/trip-gps/types.ts`
- **create** `lib/trip-gps/cadence.ts`
- **create** `lib/trip-gps/geo.ts`
- **create** `lib/trip-gps/client.ts`

## Tasks
1. `types.ts` — shared types: `LocationPayload`, `LocationLatest`, `ShareSession`, `ViewerState`, `TrackerMode = "active" | "saver" | "rest"`, `UploadReason`. Match the overview's data contract field names.
2. `cadence.ts` — single source for the constants (`ACTIVE 5m / SAVER 10m / REST 15m / STALE_AFTER 15m / OFFLINE_AFTER 30m / MAX_BAD_ACCURACY_M 250`); `intervalForMode(mode)`; `freshnessFor(ageMs)` → `fresh | stale | offline`; `nextPollMs(state)`.
3. `geo.ts` — `sanitizeCoords()` (reject lat∉[-90,90], lng∉[-180,180], negative accuracy, invalid timestamp), `isAcceptableAccuracy(accuracyM, reason)`, optional `haversineMeters(a, b)`.
4. `client.ts` — `uploadLocation(point, { token })` (HTTPS POST to the Phase-4 route) plus a retry/offline-queue **skeleton** (interface + no-op queue for now; real queue is Phase 8).

## Acceptance criteria
- [ ] Pure functions, no React / no `window` imports at module top level.
- [ ] All cadence/freshness numbers come from `cadence.ts` only (no magic numbers elsewhere).
- [ ] `lint` + `build` pass. (If a test runner is added later, these are the prime unit-test targets.)

## Out of scope
- Network endpoint implementation (Phase 4), persistence (Phase 5), real offline queue (Phase 8).
