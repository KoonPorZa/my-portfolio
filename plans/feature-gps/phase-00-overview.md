# GPS Live-Location — Codex Handoff Overview

> **Read this once, then execute one `phase-NN-*.md` file at a time.**
> Source of truth: `plan-gps-tracking.html` + `research-gps-tracking.html` (same folder).
> These phase files are the token-light executable split of that plan. Each phase file is
> self-contained enough to run on its own; come back here only for shared context.
> Backend update: Phase 11 supersedes the original Next Route Handler API plan with a
> dedicated Fastify backend. If the HTML plan conflicts with Phase 11, follow Phase 11.

> Workspace note: the repo is now an npm workspace; the Next frontend moved to
> `apps/web/` (so paths written as `app/...`, `lib/trip-gps/...`, or
> `components/...` in these phase docs now live under `apps/web/`), and the
> Fastify backend is in `apps/api/` (Phase 11).

---

## What we are building

Live-location sharing for the existing private roadbook at `app/trip/001`.

- **Owner (rider):** on `/trip/001` (a public page now — no password gate), sees a "Live Location" panel to Start/Stop sharing, change cadence, and Manual ping while riding สงขลา → กรุงเทพฯ. The panel only appears when the GPS flag is on, and starting a session still requires a server-side owner code (Phase 7).
- **Viewer (a known person):** opens a tokened link `/trip/001/live?t=…` and sees the latest position + freshness state, read-only.
- **Not** a turn-by-turn nav app. Web MVP first; native tracker is a future spike only if browser background limits prove blocking.

## Non-negotiable guardrails (apply to EVERY phase)

1. **Branch:** all implementation happens on **`feat/gps`**. Never commit feature code to `develop`. (Phase 1 creates/switches the branch.)
2. **Security boundary:** `/trip/001` is **public now** (the old client-side password gate was removed). Page access is therefore **not** a security boundary — owner upload and viewer reads are gated only by server-side tokens / a server-side owner code (Phase 7). Never gate live location on page access or any client-side secret.
3. **Secrets:** no server secret / Supabase service-role key in the client bundle or any `NEXT_PUBLIC_*`. Server-only env, accessed only in Route Handlers, Fastify handlers, or server modules.
4. **Cost = 0 ฿:** stay inside free tiers. Do not add a paid API, billing card, or paid map/tile provider without updating the plan and asking first. MVP map = Google Maps external link.
5. **Dependency gate:** add a dependency only when its phase calls for it. Approved for the web app: `leaflet` (optional map enhancement). Approved for the Fastify backend track in Phase 11: `fastify`, `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/sensible`, `@sinclair/typebox`, `@supabase/supabase-js`, `tsx`, and `vitest`. Not now: `react-leaflet`, `socket.io`, `firebase`, and `zod`.
6. **Owner-initiated:** location is only captured/sent after the owner taps **Start**. Before Start, nothing leaves the device.
7. **Verify before done:** `npm run lint` + `npm run build` must pass. If a phase can't be tested on a real mobile device over HTTPS, state the validation gap explicitly.

## Tech stack (already decided — do not re-litigate)

| Layer | Choice |
| --- | --- |
| App | Existing Next.js 16 App Router, React 19, TypeScript, CSS Modules |
| GPS capture | `navigator.geolocation.getCurrentPosition()` periodic snapshot (active 5m / saver 10m / rest 15m) |
| API | Fastify + TypeScript backend under `apps/api`, served from `api.koonporza.com` or the selected low-cost backend host |
| DB | Supabase Postgres via `@supabase/supabase-js@2`, **backend/server-side only** |
| Realtime | Viewer **polling 30–60s** (no WebSocket in MVP) |
| Map | MVP: coordinates + Google Maps link → enhancement: vanilla `leaflet` (client-only) |
| Validation | Shared domain utils in `lib/trip-gps/`; Fastify request/response schemas use TypeBox |
| Tokens | Node `crypto`: random token + SHA-256 hash stored server-side; split owner/viewer |

## Shared data contract

**Owner upload** — `POST /api/trips/001/location` with `Authorization: Bearer <owner-token>`:

```json
{ "sessionId": "trip01_2026_…", "seq": 42, "lat": 13.5361776, "lng": 100.2209807,
  "accuracyM": 24, "speedMps": 18.4, "headingDeg": 12,
  "clientTs": "2026-06-28T10:29:42.120Z", "mode": "active", "reason": "scheduled" }
```

**Viewer latest** — `GET /api/trips/001/location?t=<viewer-token>`:

```json
{ "status": "active", "freshness": "fresh", "viewerState": "fresh",
  "latest": { "lat": 13.5361776, "lng": 100.2209807, "accuracyM": 24,
    "clientTs": "…", "serverTs": "…" },
  "nextPollMs": 60000, "message": "ตำแหน่งล่าสุดยังสด" }
```

**Cadence / freshness constants** (single source — keep in `lib/trip-gps/cadence.ts`):

```
ACTIVE 5m · SAVER 10m · REST 15m · STALE_AFTER 15m · OFFLINE_AFTER 30m · MAX_BAD_ACCURACY_M 250
```

**Tables (Supabase):**
- `trip_share_sessions` — `id, trip_id, active, expires_at, revoked_at, owner_token_hash, viewer_token_hash`
- `trip_location_latest` — `session_id, lat, lng, accuracyM, mode, reason, clientTs, serverTs` (1 row/session)
- `trip_location_points` — latest fields + `seq` (history; delete after 24–72h)

**Viewer states:** loading · invalid/expired · waiting-first-gps · fresh (≤15m) · stale (15–30m) · offline (>30m) · stopped.

## Backend split direction

The GPS API is moving out of Next.js Route Handlers and into a dedicated
Fastify service. Keep the Next app focused on the roadbook UI, owner tracker
panel, and viewer page. The Fastify service owns token validation, Supabase
service-role access, rate limiting, and all GPS API responses.

Use `phase-11-fastify-backend.md` as the implementation phase for the backend
service. It replaces the Next Route Handler implementation work from Phase 4
and the server-side Supabase wiring from Phase 5. Phase 4 and Phase 5 remain as
historical context for the data contract and storage behavior, but new backend
work must follow Phase 11.

## Phase index

| File | Phase | Priority | Depends on |
| --- | --- | --- | --- |
| `phase-01-branch-and-flag.md` | Branch setup & feature flag | P0 | — |
| `phase-02-tracker-panel.md` | Owner tracker panel on /trip/001 | P0 | 01, 03 |
| `phase-03-domain-utils.md` | Location domain utilities (`lib/trip-gps`) | P0 | 01 |
| `phase-04-api-route.md` | Superseded Next API route context | P1 | 03 |
| `phase-05-storage-supabase.md` | Superseded Supabase storage context | P1 | 04 |
| `phase-06-viewer-page.md` | Viewer page `/trip/001/live` | P1 | 11 |
| `phase-07-security-tokens.md` | Token lifecycle & security | P1 | 11 |
| `phase-08-reliability.md` | Reliability for real trip | P2 | 02, 11, 06 |
| `phase-09-native-spike.md` | Native tracker spike | Future | (gated by MVP results) |
| `phase-10-cloudflare-edge.md` | Cloudflare edge layer (DNS/WAF/analytics) | P1 | 11, 06 + deploy |
| `phase-11-fastify-backend.md` | Fastify backend service | P1 | 03 |
| `phase-12-weather.md` | Weather (Open-Meteo) on live + roadbook | P2 | 06, 11 |
| `phase-13-progress.md` | Planned vs actual stop timeline | P2 | 11, 06, 02 |
| `phase-14-api-hardening.md` | Rate-limit hardening + bot/abuse guard | P1 | 11 |
| `phase-15-actual-track-timeline.md` | Actual track polyline + arrival timeline v2 | P2 | 13, 11 |
| `phase-16-observability.md` | Observability & ops (health/logs/errors) | P2 | 11 |

**Suggested order:** 01 → 03 → 02 → 11 → 07 → 06 → 08 → (09 only if needed).
**Post-MVP hardening/ops:** 14 (API hardening, P1 — do early, owner-code brute-force guard) → 15 (actual track + arrival timeline) → 16 (observability).
Phase 10 (Cloudflare edge) is **mostly Cloudflare-dashboard config done at deploy time** — its only
repo code (Fastify API `no-store` headers + a privacy-safe analytics beacon) can land any time after 11/06.
P0–P1 = shippable MVP. P2 = hardening. Future = optional. Cloudflare = edge defense-in-depth, **not** auth.

## How to hand a phase to Codex or Claude

Run one phase at a time so Codex only loads what it needs:

```
codex: Implement plans/feature-gps/phase-03-domain-utils.md.
Read plans/feature-gps/phase-00-overview.md for shared context (guardrails,
tech stack, data contract). Work on branch feat/gps only. When done, run
`npm run lint` and `npm run build`, and report files changed + how to verify.
```

For the backend split, hand off Phase 11 directly:

```
claude: Implement plans/feature-gps/phase-11-fastify-backend.md.
Read plans/feature-gps/phase-00-overview.md and docs/env-doc.md first.
Use Fastify + TypeScript in apps/api. Do not implement the superseded Next Route
Handler phases. Keep secrets server-only. When done, run backend lint/build/test
and web lint/build, then report files changed + verification gaps.
```

After each phase: confirm lint/build pass and acceptance criteria in that phase file are met before starting the next.
