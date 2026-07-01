# Phase 17 — Optional Google motorcycle map (Routes API TWO_WHEELER)

**Priority:** P3 (opt-in, **billed**) · **Branch:** `develop` · **Depends on:** Phase 6 (viewer), Phase 11 (backend), Phase 14 (abuse/cost guard), Phase 15 (actual track)
**Read first:** `phase-00-overview.md` (guardrail #4 — Google mode is an opt-in billing path), `phase-11-fastify-backend.md`, `docs/env-doc.md`
**Origin:** owner request — show the **exact motorcycle route** that matches the Google Maps the owner will actually navigate with.

## Goal
Add an **optional** "Google motorcycle map" mode to `/trip/001/live`: render the
planned route using **Google Routes API `travelMode: TWO_WHEELER`** on a **Google
Maps JavaScript** map, so the viewer's planned line matches Google Maps' own
motorcycle routing. This mode is **opt-in and billed** — the default viewer stays on
the free MapLibre + OSRM/OSM route (Phase 6 / 15) and MUST keep working with no
Google keys set.

## Non-negotiables (policy)
- **Google geometry → Google map only.** Route geometry / polylines returned by
  Google Routes (or Directions) may be rendered **only** on the Google Maps JS map.
  NEVER draw Google-derived geometry on MapLibre / OSM. (Google Maps Platform ToS.)
- **Temporary cache, not static.** Google route results are a **time-boxed cache**
  (TTL), never committed to the repo and never treated as permanent static geometry.
  Contrast: the OSRM/OSM line in `apps/web/lib/trip-route-geometry.ts` is OSM/ODbL and
  MAY be a committed static file — Google results may not.
- **Routes API key is server-only.** The `TWO_WHEELER` route is fetched by the
  backend; `GOOGLE_MAPS_ROUTES_API_KEY` is NEVER in the browser bundle or any
  `NEXT_PUBLIC_*`.
- **Maps JS browser key is public but restricted.** It must ship to the client to
  load the map, so it MUST be locked down with an **HTTP-referrer allowlist + a low
  quota** in the Google Cloud console. It is a **separate** key from the Routes key.
- **Default cost 0 ฿.** Off by default; enabling requires asking first + a low daily
  quota + the cost guard below.

## Scope
- Google Maps JS renderer component (loaded **only** when the mode is enabled).
- Backend endpoint that fetches + **temporarily caches** the Google `TWO_WHEELER`
  planned route.
- Planned motorcycle route drawn on the Google map.
- Our own **actual GPS track** (`track` from the viewer response, Phase 15) overlaid
  on the Google map.
- Live marker / stops / status identical to the existing viewer (this mode is a
  renderer swap, not a new data model).

## Env
Server-only (backend, `apps/api`):
```
GOOGLE_MAPS_ROUTES_API_KEY=                 # Routes API key — server-only, NEVER public
TRIP_GOOGLE_ROUTE_CACHE_TTL_SECONDS=86400   # temporary cache TTL (e.g. 1 day)
TRIP_GOOGLE_ROUTE_DAILY_QUOTA=50            # backend cost-guard cap on upstream calls/day
```
Public (frontend, `apps/web`, build-time — inlined into the client):
```
NEXT_PUBLIC_TRIP_GOOGLE_MAP_ENABLED=0       # feature flag, OFF by default
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=        # Maps JS key — public but referrer + quota restricted
```
Never place `GOOGLE_MAPS_ROUTES_API_KEY` in any `NEXT_PUBLIC_*`. Document all keys in
`docs/env-doc.md`; restriction steps (referrer allowlist, per-key quota, separate keys
per API) in `DEPLOY.md`.

## Backend (apps/api)
1. **Endpoint** `GET /api/trips/:tripId/google-route` → returns the cached planned
   `TWO_WHEELER` route for the trip: `{ polyline | coordinates, distanceMeters,
   durationSeconds, source: "google", cachedAt, expiresAt }`. No viewer token needed
   (non-sensitive planned route), but see cost guard.
2. Server calls Google **Routes API** (`routes:computeRoutes`, `travelMode:
   "TWO_WHEELER"`) with the 10 stop waypoints (server owns `TRIP_001_STOP_COORDS`),
   using `GOOGLE_MAPS_ROUTES_API_KEY` and a **`X-Goog-FieldMask`** limited to route
   geometry + legs (minimize billed fields).
3. **Temporary cache** the result (in-memory + optional Supabase row) keyed by
   `tripId` + a hash of the waypoints, with TTL `TRIP_GOOGLE_ROUTE_CACHE_TTL_SECONDS`.
   Serve from cache on hit; refetch only on miss/expiry. The route is fixed per trip
   ⇒ ~1 upstream call per TTL window.
4. **Cost guard:** enforce a daily upstream-call cap (`TRIP_GOOGLE_ROUTE_DAILY_QUOTA`)
   + a per-IP rate limit on the endpoint (Phase 14). On quota exhaustion / upstream
   error / missing key → respond with a `{ fallback: true }` signal (or 503) so the
   frontend uses the MapLibre + OSRM route instead. Never expose the server key or the
   raw upstream error/body.
5. Response schema via TypeBox. Do not let a CDN cache it under any token-bearing URL
   (the endpoint takes no token); a short public cache of the planned route is fine
   but is NOT required.

## Frontend (apps/web)
6. Load Google Maps JS **only when** `NEXT_PUBLIC_TRIP_GOOGLE_MAP_ENABLED === "1"`
   AND `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` is set (dynamic import / on-demand script
   inject; never request the Google script for the default viewer).
7. When enabled, render a Google map, fetch the planned route from
   `/api/trips/:tripId/google-route`, and draw it on the Google map. If the endpoint
   returns `fallback` (or the Google script fails to load) → **fall back to the
   MapLibre viewer**.
8. Overlay our **actual GPS track** (from `track`, Phase 15) + live marker + stops +
   status on the Google map, matching the existing viewer.
9. Optional UI toggle "แผนที่มอเตอร์ไซค์ (Google)" ↔ "แผนที่ปกติ (ฟรี)", default =
   MapLibre. Keep the trip roadbook design around the map frame.

## Cost guard (summary)
- **Off by default** (flag).
- Low daily quota on **both** keys (Google Cloud console) + a backend daily cap.
- **Temporary cache** (TTL) ⇒ near-zero upstream calls for a fixed route.
- Per-IP **rate limit** on the endpoint (Phase 14) so bots can't burn quota.
- Deterministic **fallback** to the free MapLibre + OSRM route on missing key / quota /
  error.

## Acceptance criteria
- [ ] With **no** Google env set, the viewer still loads on MapLibre + OSRM route
      (no regression; the Google script is never requested).
- [ ] With valid keys + flag on, the Google map shows the `TWO_WHEELER` planned route.
- [ ] The **actual track** always comes from our own GPS data (never from Google).
- [ ] No Google-derived geometry is ever drawn on MapLibre/OSM (policy verified).
- [ ] Google route results are served from a TTL cache; a repeated view does not
      trigger a new upstream call; quota/rate-limit blocks endpoint abuse.
- [ ] Routes API key never reaches the client; the browser key is referrer + quota
      restricted (documented in `DEPLOY.md`).
- [ ] backend lint/build/test + web lint/build pass; the feature is opt-in and reversible.

## Out of scope
- In-app turn-by-turn navigation (the owner uses the Google Maps app for that).
- Replacing MapLibre as the default renderer; multi-trip; permanently caching Google
  geometry; drawing Google geometry on the free map.
