# Phase 2 — Owner tracker panel on /trip/001

**Priority:** P0 · **Branch:** `feat/gps` · **Depends on:** Phase 1 (flag), Phase 3 (domain utils)
**Read first:** `phase-00-overview.md` (guardrails, cadence constants, data contract)

## Goal
Add a "Live Location" panel inside `/trip/001`, visible only when the GPS flag is on,
letting the rider start/stop sharing themselves. The page itself is public now (no password
gate), so visibility is the flag alone; real auth is the owner code in Phase 7.

> **Keep `TRIP_GPS_ENABLED` off in any shared/public deploy until Phase 7 lands.** With no
> password gate, turning the flag on would expose the owner Start/Stop controls to every
> visitor. Use the flag for local/dev now, or after the owner code is enforced.

## Files
- **create** `app/trip/001/live-tracker.tsx` (`"use client"`)
- **modify** `app/trip/001/trip-client.tsx` (render `<LiveTracker/>` behind the GPS flag)
- **modify** `app/trip/001/trip.module.css` (panel styles, matching the rally-roadbook theme) — or a new `live-tracker.module.css`

## Tasks
1. Render the panel only when `isGpsEnabled()` (there is no unlock state anymore).
2. **Pre-start checklist** (display before sharing): turn on phone GPS/Location Services, open this page over HTTPS, bring a power bank, note that the browser may stop updating when the screen locks / tab is hidden.
3. Controls: **Start sharing**, **Stop sharing**, **Manual ping**, **Battery saver**, **Rest mode**.
4. **Permission timing:** call `getCurrentPosition()` only *after* the user taps Start (so the prompt follows a user gesture). On `denied`, show how to re-enable permission + a retry button. If `navigator.geolocation` is missing, show an unsupported message.
5. Periodic capture using cadence constants from `lib/trip-gps/cadence.ts`: active 5m, saver 10m, rest 15m. Send immediately on Start, Stop, and Manual ping. Use the upload client from Phase 3 (`lib/trip-gps/client.ts`) and call the Fastify backend through `NEXT_PUBLIC_TRIP_GPS_API_BASE` once Phase 11 lands.
6. Live status to display: permission, current mode, next-send countdown, last sent time, accuracy, upload status, wake-lock status, viewer link + copy button, last error.
7. Optional Screen Wake Lock; show a warning when the page is hidden / screen may lock and updates could pause.

## Acceptance criteria
- [ ] Panel appears only when the flag is on (no unlock gate).
- [ ] Before Start, no location is captured or sent.
- [ ] Tapping Start triggers the browser permission prompt and sends the first point on allow.
- [ ] Active → next send ~5m; saver → ~10m; Manual ping → immediate.
- [ ] Stop clears timer/watch/wake-lock and triggers session stop (Phase 11/7).
- [ ] Mobile-responsive; matches the light roadbook theme; `lint` + `build` pass.

## Out of scope
- Backend persistence, token validation, viewer page (Phases 11, 7, and 6).
