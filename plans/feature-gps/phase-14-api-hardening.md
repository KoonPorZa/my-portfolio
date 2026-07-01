# Phase 14 — API rate-limit hardening + bot/abuse guard

**Priority:** P1 (security) · **Branch:** `develop` · **Depends on:** Phase 11 (Fastify backend)
**Read first:** `phase-00-overview.md`, `phase-11-fastify-backend.md`, `docs/env-doc.md`
**Origin:** owner idea list #5 — "ใส่ rate limit ที่ Fastify สำหรับ route สำคัญ (upload/viewer/start session) กันโดนยิงมั่ว ๆ บน Railway".

## Goal
Harden the public API on Railway against abuse, owner-code brute force, and dumb
bot traffic — **without** breaking legit viewers. Per-route rate limits already
exist; this phase closes the real gaps around them.

## Current state (already done — do NOT rebuild)
- `@fastify/rate-limit` registered (`apps/api/src/plugins/rate-limit.ts`): baseline
  **60/min**, `global: false`, 429 `{ error: "rate_limited" }`.
- **Per-route overrides already set** (`apps/api/src/modules/trip-gps/trip-gps.routes.ts`):
  owner writes (`POST location`, `session/start`, `session/stop`, `POST progress`)
  = **20/min** group `trip-gps-owner`; viewer `GET location` = **60/min** group
  `trip-gps-viewer`. `GET /health` = `rateLimit: false`.
- Helmet defaults on (`plugins/security.ts` = `{}`); CORS is env-driven
  (`plugins/cors.ts`, `CORS_ORIGINS`).

## Gaps to close
1. **Trust proxy / real client IP (correctness of every limit).** Railway sits
   behind a proxy, so the default keyGenerator (socket IP) may collapse all clients
   onto one proxy IP — either one shared bucket (self-DoS) or a trivially bypassable
   limit. Set Fastify `trustProxy` (or a keyGenerator that takes the first
   `x-forwarded-for` hop) and **verify on Railway** that `request.ip` is the real
   client, not the proxy.
2. **Owner-code brute-force guard (highest priority).** `session/start` checks the
   short owner code (currently 4 digits ≈ 10k combinations) and lives under the
   20/min owner group ⇒ ~28.8k tries/day → crackable. Add: a **dedicated tighter
   limit** for `session/start` (e.g. 5/min) **plus** a per-IP failed-attempt counter
   with backoff / temporary lock (e.g. 10 wrong codes → 15-min block), returning a
   **generic 401** (no oracle). Flag (don't force) lengthening the owner code via
   config.
3. **Bot / junk-request guard (lightweight, no heavy dep).** Reject obviously bad
   requests early: method allowlist, require `content-type: application/json` on
   POST, a small `bodyLimit` (GPS payloads are tiny — 8–16 KB is plenty), and an
   optional UA heuristic on **write** routes only (block empty/known-scanner UAs —
   never block read/viewer traffic). Fail open for real browsers.
4. **429 polish.** Add `Retry-After`; keep the generic body.
5. **Config.** Expose limits/windows via env (`RATE_LIMIT_*`) with safe defaults;
   document in `docs/env-doc.md`.
6. **Google route endpoint cost guard (only if Phase 17 is enabled).** The optional
   `GET /api/trips/:tripId/google-route` (Phase 17) proxies a **billed** upstream
   (Google Routes API). It MUST sit behind a strict per-IP rate limit **and** be
   served **cache-first** (temporary TTL cache) so bursts/refreshes/bots cannot fan
   out to the billed API. A cache miss triggers at most one upstream call per TTL
   window; a daily upstream cap hard-stops spend and falls back to the free map. The
   Routes API key is server-only; keep it out of logs (Phase 16).

## Tasks
1. `app.ts`: enable `trustProxy` appropriately for Railway; comment why.
2. `rate-limit.ts` / routes: stricter `session/start` limit + a keyed
   failed-owner-code throttle (small plugin or in the service); generic 401.
3. Add `bodyLimit` + content-type/method guards (Fastify opts or a tiny preHandler).
4. Env-configurable limits + `docs/env-doc.md` update.
5. Tests (vitest): Nth wrong owner code → throttled; oversized body → 413;
   wrong content-type → 415; viewer limit unaffected by owner limit; forwarded-IP
   keying (unit).

## Acceptance criteria
- [ ] Repeated wrong owner codes are throttled/locked before the code space can be
      brute-forced; a legit `session/start` still works.
- [ ] Behind the proxy, limits key on the real client IP (documented Railway check).
- [ ] Oversized / wrong-content-type writes rejected (413/415) without touching the store.
- [ ] Existing owner/viewer limits + `/health` exemption still pass; backend
      lint/build/test green.
- [ ] No new heavy dependency; secrets unchanged; no token/oracle leak.
- [ ] (If Phase 17 enabled) the Google route endpoint is strictly rate-limited and
      **cache-first**: repeated/burst requests are served from the TTL cache and never
      fan out to the billed Routes API; the daily upstream cap blocks quota-burning and
      falls back to the free map.

## Out of scope
- Cloudflare edge WAF / rate rules (Phase 10), CAPTCHA, account system, and
  network-level DDoS mitigation beyond app-level limits.
