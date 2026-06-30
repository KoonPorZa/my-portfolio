# Phase 10 — Cloudflare edge layer (DNS/Proxy, WAF rate-limit, Web Analytics)

**Priority:** P1 · **Branch:** `feat/gps` · **Depends on:** Phase 11 (Fastify API), Phase 6 (viewer) + real frontend/backend deploys with the domain on Cloudflare
**Read first:** `phase-00-overview.md`

## Goal
Put Cloudflare **in front of** the public web and API hostnames as an edge
layer: DNS/proxy/CDN, WAF + rate limiting, and Web Analytics. The backend is a
dedicated Fastify service from Phase 11. Cloudflare is **defense-in-depth, not
the auth boundary.**

> **Path note:** the source HTML plan still shows the pre-move paths (`/trip-01`, `/api/trips/trip-01/*`).
> The shipped code uses **`/trip/001`**, **`/api/trips/001/location`**, **`/api/trips/001/session/*`**, and
> **`/trip/001/live`** — use THESE when writing Cloudflare rules.

## Scope split (read this first)
- **Cloudflare DASHBOARD config = owner action, no repo code** (Claude cannot touch the Cloudflare
  account, and changing account/security settings is out of scope): DNS proxy for `koonporza.com`
  and `api.koonporza.com`, WAF rules, rate-limit thresholds, cache rules, and Web Analytics enablement.
- **Repo code = 2 small touchpoints** (the tasks below): explicit no-store headers on the Fastify GPS API,
  and a privacy-safe Web Analytics beacon component in the frontend.

## Files (repo code)
- **modify** Fastify GPS API responses in `apps/api/src/modules/trip-gps/` — explicit
  `Cache-Control: no-store` and `CDN-Cache-Control: no-store` on sensitive responses.
- **create** a Cloudflare Web Analytics beacon component, wired into the root layout, rendered ONLY on
  non-token pages (NEVER on `/trip/001/live*`), gated by `NEXT_PUBLIC_CF_BEACON_TOKEN` (off when unset).
- **update** `.env.example` with `NEXT_PUBLIC_CF_BEACON_TOKEN` (public, optional).

## Tasks — repo code
1. **No-store API:** set `Cache-Control: no-store` and
   `CDN-Cache-Control: no-store` on the Fastify location GET/POST and session
   responses, so no proxy/CDN, including Cloudflare, ever caches live location
   or `*_latest`.
2. **Analytics beacon (privacy-safe):** a `<CfWebAnalytics/>` that injects the CF beacon only when
   `NEXT_PUBLIC_CF_BEACON_TOKEN` is set AND the current path carries no viewer token. Concretely it must
   **not** render on `/trip/001/live` (token in `?t=`). Default OFF. The beacon must never see the viewer token.

## Tasks — Cloudflare dashboard (owner action; documented here, not code)
1. **DNS/Proxy/CDN:** set the web hostname's DNS record to **Proxied** in front of Vercel, and set
   `api.koonporza.com` to **Proxied** in front of the Fastify backend host if that host supports it.
   Keep verification/TXT records **DNS-only**. SSL/TLS = **Full (Strict)** once the origins are ready.
   Do **not** cache `/api/trips/001/*` or `/trip/001/live*`; cache only safe static assets.
2. **WAF + Rate limiting:** scope rules to `/api/trips/001/location*` + the session endpoint (+ optional
   `/trip/001/live*`). Owner POST: challenge/block above ~10–20 req/min/IP. Viewer GET: keep the limit
   **above** normal 30–60s polling (e.g. 30–60 req/min/IP) so real viewers aren't blocked. WAF is
   defense-in-depth; the Fastify backend still validates token + payload itself.
3. **Web Analytics:** enable for the portfolio + `/trip/001` + non-sensitive pages. Use **manual** beacon
   placement (the app's `CfWebAnalytics` component) and keep **automatic injection OFF**, so the beacon is
   never injected onto the token-bearing viewer URL. Never send a viewer-token URL to analytics.
4. Record rule names/thresholds in deployment notes for rollback/debug.

## Acceptance criteria
- [ ] `/api/trips/001/location` (GET+POST) and session responses send `Cache-Control: no-store` — confirm with `curl -I` against the Fastify backend hostname.
- [ ] Beacon never renders on `/trip/001/live`; entirely off when `NEXT_PUBLIC_CF_BEACON_TOKEN` is unset.
- [ ] `lint` + `build` pass.
- [ ] (Owner, post-deploy) DNS proxied; location API not cached by Cloudflare (`cf-cache-status: DYNAMIC`/`BYPASS`);
      WAF/rate-limit doesn't block normal viewer polling but challenges abnormal bursts.

## Out of scope
- Cloudflare Workers / D1 / Durable Objects / R2 / KV — the MVP stays frontend host + Fastify backend + Supabase.
- Wrangler/Terraform automation of the dashboard config (manual now; automate later if needed).
