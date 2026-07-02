# Phase 16 — Observability & ops (health, logs, request-id, deploy status, errors)

**Priority:** P2 (DevOps) · **Branch:** `develop` · **Depends on:** Phase 11 (backend)
**Read first:** `phase-00-overview.md`, `phase-11-fastify-backend.md`, `DEPLOY.md`
**Origin:** owner idea list #10 — "health endpoint, structured logs, request id, Railway deploy status, error dashboard".

## Goal
Make the Railway backend observable and debuggable: richer health/readiness, safe
structured logs, request tracing end-to-end, deploy visibility, and error surfacing —
all with **zero forced cost** (any external service is opt-in via env, off by default).

## Current state (already done — enhance, don't rebuild)
- `GET /health` → `{ status: "ok", service: "trip-gps-api" }` (liveness only; no
  store check / version / uptime; `rateLimit: false`) — `modules/health/health.routes.ts`.
- Request-id: `x-request-id` on request + response, `requestId` in logs
  (`plugins/request-id.ts`, `app.ts` `requestIdHeader`/`requestIdLogLabel`).
- Logger: pino structured JSON, level `info` (prod) / `debug` (dev), redacts
  `authorization` / `cookie` / `set-cookie` (`lib/logger.ts`). Global error handler
  logs `err`.
- **Missing:** version/build info, readiness/store health, `?t=` token redaction in
  logged URLs, external error tracking, metrics.

## Tasks
1. **Health split.** Keep `/health` = cheap liveness (no deps). Add **`/ready`** =
   readiness: light store probe (for Supabase, a short-timeout `select 1`/HEAD),
   returns 200/503 + `{ store, latencyMs }`. Point Railway/uptime probes at the
   right one.
2. **Version / build info.** Surface `version` (git SHA) + `startedAt`/uptime on
   `/health` or a `/version`. Read Railway's `RAILWAY_GIT_COMMIT_SHA` (or a
   `GIT_SHA` env injected at build) with a `package.json` version fallback — so a
   running instance ties to a commit.
3. **Log hygiene (security — real leak).** Pino logs `req.url`, which contains the
   viewer token `?t=<token>`. Add a URL serializer/redaction that strips or masks the
   `t` query param (Bearer already covered). Re-confirm owner code + service-role key
   are never logged. If Phase 17 is enabled, also guarantee the **Google Routes API
   key** and the public **Maps JS browser key** never appear in logs or error bodies.
4. **Request tracing.** Accept an inbound client-provided `x-request-id` and echo it;
   include the request-id in **error response bodies** so a user can quote it.
5. **Deploy status visibility.** Document reading Railway deploy state/logs
   (`railway status` / `railway logs`, the Railway MCP `list_deployments`, or the
   dashboard) in `DEPLOY.md`; optional tiny `/version` the frontend can ping to
   confirm the live build. No secret exposure.
6. **Error surfacing.** Pick a lightweight path: (a) Railway logs + a saved
   error-log query/runbook, or (b) **Sentry free tier** (`@sentry/node`) gated by
   `SENTRY_DSN` (off by default, no cost). Wire the global error handler to report
   with the request-id and redaction. Recommend (b) as opt-in.
7. **Metrics (optional).** A minimal counter (requests, 4xx/5xx, upload rate) via
   logs or a guarded `/metrics` — flag as optional; do **not** add Prometheus/Grafana
   unless asked.
8. **Google route observability (only if Phase 17 enabled).** Log/count the Google
   route endpoint's **cache hit/miss**, upstream request count, and daily-quota /
   cost-guard state (near/at cap, fallback served) so cache effectiveness and spend are
   visible. These logs/metrics MUST never include the Routes API key, the browser key,
   or any viewer token.

## Acceptance criteria
- [ ] `/health` (liveness) + `/ready` (readiness w/ store check) behave correctly
      (200 vs 503); probe usage documented in `DEPLOY.md`.
- [ ] Version/uptime surfaced; a running instance maps to a git SHA.
- [ ] No token/secret in logs — `?t=` redaction verified against a captured log line.
- [ ] Request-id present in logs **and** error response bodies; inbound id respected.
- [ ] Error-tracking path documented (Sentry opt-in via env, off by default, no cost)
      OR a Railway log runbook.
- [ ] Backend lint/build/test green; no secret exposure; no forced paid service.
- [ ] (If Phase 17 enabled) Google route cache hit/miss + upstream count + quota/cost
      state are observable, and no API key or viewer token appears in logs or error bodies.

## Out of scope
- Full APM / Prometheus / Grafana stacks; frontend RUM (Cloudflare/Vercel analytics
  already handled); any paid tier without asking first.
