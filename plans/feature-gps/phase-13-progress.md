# Phase 13 — Planned vs actual timeline (auto-detect + manual)

**Priority:** P2 · **Branch:** `feat/gps` · **Depends on:** Phase 11 (Fastify backend), Phase 6 (viewer), Phase 2 (share panel)
**Read first:** `phase-00-overview.md`. Monorepo: frontend in `apps/web/`, backend in `apps/api/`.

## Goal
Given the roadbook's planned schedule, record + show the **actual** travel times
("ถึงปั๊มนี้กี่โมง") and compare against plan. Two capture modes (user chose **both**):
- **Auto:** backend stamps a stop's arrival when the rider's live GPS passes within range.
- **Manual:** the owner can set / correct / clear a stop's arrival time on `/trip/001/share`.

## DESIGN SYSTEM (IMPORTANT)
All UI here lives on the **trip pages** → use the **trip "rally roadbook" design
system** (CSS Modules + warm tokens from `.tripRoot`/`.liveRoot`: `--card --ink
--ink-soft --muted --line --line-strong --accent #cf451c --rest #2f6b41 --danger
--radius --shadow-soft`, fonts `--trip-sans/--trip-mono`). **NEVER** the portfolio
neon Tailwind (`bg-panel/elevated`, `border-line`, `text-cyan/lime/magenta`,
`font-mono`, `--glow-*`). Color-code deltas with trip accents: `--rest` green = on
time / early, `--accent` orange = a bit late, `--danger` red = very late, `--muted`
= not reached yet. Match the existing roadbook/viewer cards.

## Architecture decision — keep the shared surface tiny (mirror, not a shared package)
The backend needs ONLY the **ordered stop coordinates** (for proximity). It stores
just **actual arrival timestamps per stop index**. The **frontend** owns the planned
schedule (it already computes it in `trip-client.tsx` via `buildTimedStops`) and
computes the **delta** (actual − planned). So:
- Do **not** create a shared workspace package (a TS package across Next-bundler +
  tsc-CJS adds build-order complexity not worth it for one trip's data).
- `apps/api` gets a small constant `TRIP_001_STOP_COORDS: [number, number][]` (10
  entries, SAME order as the `stops` array in `apps/web/app/trip/001/trip-client.tsx`
  — copy the coords exactly; add a comment that the two lists must stay in sync).

## Data model
- Session gains stop arrivals. In-memory store: `stopArrivals: Map<number, { arrivedAt: string; source: "auto" | "manual" }>` keyed by stop index (0-based).
- Supabase: add table to `plans/feature-gps/sql/schema.sql`:
  `trip_stop_arrivals(session_id text references trip_share_sessions(id) on delete cascade, stop_index int, arrived_at timestamptz, source text check (source in ('auto','manual')), primary key (session_id, stop_index))` + RLS deny-by-default like the other tables.

## Backend tasks (apps/api)
1. `TRIP_001_STOP_COORDS` constant + `ARRIVAL_RADIUS_M = 250` + reuse haversine (port from geo if needed).
2. **Auto-detect on upload:** in the location-upload path, after a point is stored, for each stop index not already recorded, if `haversine(point, coord) <= ARRIVAL_RADIUS_M`, record `{ arrivedAt: serverTs, source: "auto" }`. (Don't overwrite an existing arrival — manual or auto.) Repo: in-memory + Supabase upsert (ignore conflict on existing index).
3. **Manual endpoint:** `POST /api/trips/:tripId/progress` (Authorization: Bearer owner-token) body `{ stopIndex: number, arrivedAt?: string | null, action?: "set" | "clear" }`. `set` → upsert `{ arrivedAt, source:"manual" }` (overrides auto); `clear` → delete that index. Validate stopIndex in range, owner token (401), tripId (404). no-store headers. Returns the updated arrivals list.
4. **Expose arrivals:** include `stopArrivals` (array of `{ index, arrivedAt, source }`, sorted by index) in the viewer-latest GET response, and return it from the session/progress endpoints so the owner page can read it too.
5. Extend tests (vitest): proximity stamps an arrival once (auto); manual set overrides; clear removes; out-of-range upload doesn't stamp.

## Frontend tasks (apps/web)
6. Extract/keep the planned-schedule builder so both the roadbook and the live pages can compute planned arrive times per stop (move `buildTimedStops` + stop metadata into `apps/web/lib/trip-stops.ts` if helpful, or export from trip-client). Frontend remains the single source of truth for planned times + names.
7. **Viewer `/trip/001/live`:** add a "ความคืบหน้า" timeline — each stop: planned arrive vs actual (or "ยังไม่ถึง"), delta badge (ช้า/เร็ว X นาที, color-coded), mark current/next stop, overall % progress (stops reached / total, or km-based). Read `stopArrivals` from the latest response. Trip design.
8. **Share `/trip/001/share`:** the same timeline PLUS owner controls per stop: "ถึงแล้ว (เวลานี้)" / edit time / "ล้าง" → call `POST /progress` with the owner token. Reflect auto-detected arrivals and allow override. Trip design.
9. All copy Thai, matching the trip tone.

## API contract additions
- `GET /api/trips/:tripId/location?t=…` response gains: `stopArrivals: { index:number, arrivedAt:string, source:"auto"|"manual" }[]`.
- `POST /api/trips/:tripId/progress` (owner Bearer) — set/clear a manual arrival; returns `{ ok:true, stopArrivals:[…] }`.

## Acceptance criteria
- [ ] Riding past a stop's coords auto-records its arrival once (verify by uploading a point near a stop → arrival appears in the viewer response).
- [ ] Owner can manually set/correct/clear a stop arrival; manual overrides auto.
- [ ] Viewer + share show planned vs actual + delta + progress, in the **trip warm design** (no neon — confirm with a neon grep + a browser look).
- [ ] backend lint/build/test pass; web lint/build pass; no server-only leak; no new dependency; tokens/secrets unchanged.

## Out of scope
- Weather (Phase 12). Editing the roadbook plan itself. Multi-trip. Realtime push (still polling).
