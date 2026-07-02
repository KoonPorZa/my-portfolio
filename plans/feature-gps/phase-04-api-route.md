# Phase 4 — API route: ingest + latest

**Priority:** P1 · **Branch:** `feat/gps` · **Depends on:** Phase 3
**Read first:** `phase-00-overview.md` (data contract, guardrails)

> **Superseded for the Fastify backend track:** If the project is using the
> dedicated Fastify service, implement `phase-11-fastify-backend.md` instead of
> creating these Next.js Route Handlers. Keep this file only as historical
> context for the API contract and behavior.

## Goal
Create the server boundary in the App Router before wiring a real database — owner uploads
in, viewer reads latest out — using a mock store first if DB credentials aren't ready.

## Files
- **create** `app/api/trips/001/location/route.ts` (Node runtime)
- **optional** `app/api/trips/001/session/route.ts` (session create/stop — can defer to Phase 7)

## Tasks
1. `export const runtime = "nodejs"`. Ensure the route is never statically cached (no stale latest).
2. **POST** (owner upload): require `Authorization: Bearer <owner-token>`; validate token + session active + not expired/revoked; rate-limit (reject faster than ~30s except `reason === "manual"`); validate payload via `lib/trip-gps/geo.ts`; upsert latest + append history through the store interface.
3. **GET** (viewer latest): require `?t=<viewer-token>`; validate viewer token + session; return the viewer-latest contract incl. `viewerState` and `nextPollMs`.
4. Structured errors: `400` invalid payload · `401` invalid token · `403` inactive/revoked · `429` too frequent. Never leak which token type failed beyond what's needed.
5. Define a `LocationStore` interface and start with an **in-memory/mock adapter** (dev only) so the route works before Supabase (Phase 5 swaps the impl).

## Acceptance criteria
- [ ] POST with a valid owner token stores a point; GET with a valid viewer token returns it.
- [ ] Invalid/missing token → 401/403; malformed payload → 400; too-frequent upload → 429.
- [ ] No server secret reaches the client; route is dynamic (not cached).
- [ ] `lint` + `build` pass; include `curl` examples for both verbs in the PR notes.

## Out of scope
- Real DB (Phase 5), full token lifecycle/hashing (Phase 7), viewer UI (Phase 6).
