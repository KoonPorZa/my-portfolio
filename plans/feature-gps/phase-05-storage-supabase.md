# Phase 5 — Supabase storage provider

**Priority:** P1 · **Branch:** `feat/gps` · **Depends on:** Phase 4
**Read first:** `phase-00-overview.md` (tables, guardrails, cost guard)

## Goal
Replace the mock store with Supabase Postgres as the real `LocationStore`, server-side only,
staying within the free tier.

## Dependency
- Add `@supabase/supabase-js` (used in server modules only).

## Files
- **create** `lib/trip-gps/store.ts` — `LocationStore` interface + Supabase implementation
- **create** `lib/trip-gps/supabase-server.ts` — server client (service role from server-only env)
- **create** SQL/migration notes (e.g. `plans/feature-gps/sql/schema.sql` or inline doc)

## Tasks
1. Implement the `LocationStore` interface from Phase 4 against Supabase.
2. Tables (see overview): `trip_share_sessions`, `trip_location_latest`, `trip_location_points`.
3. Enforce access through the server route only — enable RLS (deny-by-default) **or** keep all reads/writes behind the service-role server client. Never expose the service key to the browser or `NEXT_PUBLIC_*`.
4. Retention: documented SQL or a small cleanup script to delete `trip_location_points` older than 24–72h; clear `trip_location_latest` when a session ends.
5. Keep the mock adapter available for local dev when Supabase env is absent.

## Acceptance criteria
- [ ] With Supabase env set, POST persists to `*_latest` + `*_points`; GET reads `*_latest`.
- [ ] Service-role key only in server-only env; not in the client bundle.
- [ ] Retention path exists (script or documented SQL).
- [ ] `lint` + `build` pass. Note any step that requires a live Supabase project as a validation gap.

## Out of scope
- Realtime subscriptions (polling is the MVP), map rendering, native app.
