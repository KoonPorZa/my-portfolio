# Phase 1 — Branch setup & feature flag

**Priority:** P0 · **Branch:** `feat/gps` · **Depends on:** —
**Read first:** `phase-00-overview.md` (guardrails, tech stack, data contract)

## Goal
Start the feature on its own branch and add a feature flag so the GPS panel stays
hidden until env is configured. Nothing on `/trip/001` should change while the flag is off.

## Preflight
1. `git branch --show-current` → if not `feat/gps`, run `git switch -c feat/gps` (or `git switch feat/gps`).
2. `git status --short` → understand which files are pre-existing work vs GPS work. Do **not** reset/delete others' changes.
3. Do not add any map/realtime dependency yet (dependency gate).

## Files
- **create** `lib/trip-gps/config.ts`

## Tasks
1. In `config.ts`, expose `isGpsEnabled()` and a typed `gpsConfig` object.
   - Enabled only when the required server env exists (e.g. `TRIP_GPS_ENABLED === "1"` and Supabase env present) — **default disabled**.
   - Read server-only env here; never expose secrets to the client. A small `NEXT_PUBLIC_TRIP_GPS_UI` boolean may gate showing the UI, but capture/upload must still require a real session/token.
2. Document required env names in a short comment (server-only vs public). Do **not** commit real secrets; assume `.env.local`.

## Acceptance criteria
- [ ] Current branch is `feat/gps`.
- [ ] With no env set, `isGpsEnabled()` returns `false` and `/trip/001` renders exactly as today (no panel, no errors).
- [ ] `npm run lint` and `npm run build` pass.

## Out of scope
- Any UI, API, or DB work (later phases).
