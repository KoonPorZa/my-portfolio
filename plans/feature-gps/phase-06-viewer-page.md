# Phase 6 — Viewer page `/trip/001/live`

**Priority:** P1 · **Branch:** `feat/gps` · **Depends on:** Phase 11
**Read first:** `phase-00-overview.md` (viewer states, data contract)

## Goal
A read-only page for a known person to watch the rider's latest position via a tokened link.

## Files
- **create** `app/trip/001/live/page.tsx`
- **create** `app/trip/001/live/live-viewer.tsx` (`"use client"`, polling)
- **create** `app/trip/001/live/live.module.css`

## Tasks
1. Read viewer token from `?t=` query param (or equivalent path token); validate via the API before showing anything.
2. Handle all states: `loading`, `invalid/expired token`, `waiting first GPS`, `fresh`, `stale`, `offline`, `stopped` — with clear Thai copy and color (green/yellow/red-gray badges).
3. Show latest point: timestamp, age, accuracy, optional speed, and an explicit "last known location" label when data is old. Never imply realtime when stale/offline.
4. Show the existing route stops + an "open in Google Maps" link to the latest point + a manual refresh button. (Map marker/accuracy-circle via vanilla Leaflet is an optional later enhancement, not required for MVP.)
5. Poll `GET ${NEXT_PUBLIC_TRIP_GPS_API_BASE}/api/trips/001/location` every 30–60s (use `nextPollMs` from the response). Stop or slow polling when the session is `stopped` or the token is invalid.
6. Read-only safety: a viewer token must never be able to POST and must not see owner token/control data.

## Acceptance criteria
- [ ] Valid token shows latest location; invalid/expired shows the error state with no coordinates.
- [ ] `fresh ≤15m`, `stale 15–30m`, `offline >30m`, plus `waiting`/`stopped` all render correctly.
- [ ] Age/time display is timezone-safe; polling stops on stopped/invalid.
- [ ] Mobile-responsive; `lint` + `build` pass.

## Out of scope
- Owner controls (Phase 2), token issuance/revoke internals (Phase 7 / Phase 11), heavy map deps.
