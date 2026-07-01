# Phase 15 — Actual track polyline + arrival timeline v2

**Priority:** P2 · **Branch:** `develop` · **Depends on:** Phase 13 (arrival detect), Phase 11 (backend), the route map (`app/trip/001/live/route-map*`)
**Read first:** `phase-00-overview.md`, `phase-13-progress.md`
**Origin:** owner idea list #9 — "ตอนขี่ผ่าน stop แล้ว auto mark จาก GPS, viewer เห็น timeline ว่า Stop 01 ถึงกี่โมง, Stop 02 ยังไม่ถึง".

## DESIGN SYSTEM (IMPORTANT)
All UI here is on the **trip pages** → use the **trip "rally roadbook" system**
(CSS Modules + warm tokens `--card --ink --ink-soft --muted --line --line-strong
--accent #cf451c --rest #2f6b41 --danger`, fonts `--trip-sans/--trip-mono`).
**NEVER** the portfolio neon Tailwind. Planned line = `--accent` orange, actual
track = green `#057f73` (already in the map legend).

## Goal
Build on Phase 13 (auto + manual stop arrivals already work) to (a) draw the
rider's **actual travelled path** as a breadcrumb polyline on the `/trip/001/live`
map next to the planned road line, and (b) surface the **arrival timeline**
("Stop 01 ถึง 08:12 · Stop 02 ยังไม่ถึง") on the viewer, updating in realtime.

## Current state (already done — build on it)
- Backend: `ARRIVAL_RADIUS_M = 250`, haversine, `TRIP_001_STOP_COORDS`, auto-detect
  on upload + manual `POST /api/trips/:tripId/progress`
  (`trip-gps.service.ts`). Full history stored (`trip_location_points` + in-mem
  `history`); `getLocationTrack(sessionId, limit)` with `TRACK_POINT_LIMIT = 1500`.
  `getViewerLatest` returns `stopArrivals` and now `track: LocationTrackPoint[]`
  (`LocationTrackPoint = LocationLatest & { seq }`).
- Frontend (in progress): `route-map.tsx` accepts `actualTrack` + has the
  planned/actual legend + route-source badge; both viewers pass `track`;
  `TripProgressTimeline` (Phase 13) exists.
- **Known bug to fix first:** a tsc error at `trip-gps.service.ts:509` — a
  `ViewerLatestResponse` construction path omits the newly-required `track` field.

## Backend tasks (apps/api)
1. **Fix the track wiring:** every `ViewerLatestResponse` return path includes
   `track` (`[]` when stopped/invalid/no-session). Keep
   `ViewerLatestResponseSchema.track` in sync so build + tests pass.
2. Confirm track ordering (by `seq`/`serverTs` asc) and the 1500 cap; **downsample**
   if the payload gets large (e.g. keep every Nth point past a threshold, or reuse
   the Douglas-Peucker approach from `lib/trip-route-geometry`). Document the cap.
3. **Public/realtime history source (decide + document):** the public viewer uses
   Supabase **realtime** for the latest point, but the breadcrumb needs history.
   Options: (a) client accumulates points from realtime `INSERT`s (simplest, no new
   RLS; a refresh loses prior history) — optionally seeded by (b) a one-shot read of
   recent `trip_location_points` via a new anon `select` RLS policy. Recommend
   (a) + optional (b); do **not** widen anon access to token/session tables.

## Frontend tasks (apps/web, trip design)
4. **Map:** draw the actual track as a second polyline (green `#057f73`) with the
   planned road line kept for reference; live marker at the head of the track.
5. **Timeline:** render planned-vs-actual per stop on `/trip/001/live` — arrived
   time or "ยังไม่ถึง", delta badge (ช้า/เร็ว X นาที, color-coded with trip accents),
   mark current/next stop, overall progress. Reuse the Phase-13 `TripProgressTimeline`
   and make sure it also renders on the **public** (no-token) viewer, not just the
   token viewer.
6. **Realtime:** arrivals + track update live (no manual refresh), consistent with
   the existing realtime model.

## Acceptance criteria
- [ ] `tsc` + `next build` + backend `build`/`test` green (the `service.ts:509`
      `track` gap fixed).
- [ ] Map shows the planned road line **and** the actual travelled breadcrumb in
      distinct colors; legend counts match.
- [ ] Viewer timeline shows arrived stops with times + not-yet-reached, updating in
      realtime.
- [ ] Public (no-token) viewer gets the track + timeline (history source documented).
- [ ] Trip warm design (neon grep clean); anon reads only the allowed table(s);
      tokens/secrets unchanged.

## Out of scope
- Editing the planned schedule itself; multi-trip; native background tracking (Phase 9);
  road-snapping the actual track (raw GPS breadcrumb is the truth here).
