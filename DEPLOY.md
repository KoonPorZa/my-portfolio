# Deploy → koonporza.com

Two deployables in this monorepo:

- **`apps/web`** — Next.js 16 frontend → **Cloudflare Workers** (via the
  [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare) adapter).
- **`apps/api`** — Fastify GPS backend → **Railway** (Docker deploy from
  `apps/api/Dockerfile`, see §3). It reads Railway's injected `PORT` and binds
  `0.0.0.0`, so it runs on Railway as-is. Fastify needs a long-running Node
  server, so it does **not** run on Workers. Cloudflare fronts it at
  `api.koonporza.com` (see Phase 10).

> Why Workers and not "Cloudflare Pages"? For a Next.js app with SSR + Node
> route handlers, Cloudflare's current, documented path is **Workers + OpenNext**.
> The classic Pages `@cloudflare/next-on-pages` adapter is legacy and can't run
> this app's `runtime = "nodejs"` routes (they use `node:crypto`). "Hosting the
> site on Cloudflare" = a Worker.

## 0. Prerequisites

- A **Cloudflare account**, and `koonporza.com` added as a zone in Cloudflare
  (DNS managed by Cloudflare).
- **Node.js 22+** if you deploy from your own machine — `wrangler` 4.x requires
  it. (Cloudflare's own CI, *Workers Builds*, already uses Node 22, so the
  Git-integration path below needs nothing locally.)

## 1. Push to GitHub

```bash
git remote add origin git@github.com:<you>/portfolio-koonporza.git
git branch -M main
git push -u origin main
```

## 2. Deploy `apps/web` to Cloudflare Workers

The repo is already wired for OpenNext:

- `apps/web/wrangler.jsonc` — Worker name `portfolio-koonporza-web`,
  `main: .open-next/worker.js`, `nodejs_compat`, `ASSETS` binding.
- `apps/web/open-next.config.ts` — Cloudflare adapter config.
- `apps/web/next.config.ts` — calls `initOpenNextCloudflareForDev()` (dev-only).
- `apps/web` scripts: `cf-build`, `preview`, `deploy`, `cf-typegen`.

### Option A — Workers Builds (Git integration, recommended)

No local Node version juggling; Cloudflare builds on push.

1. Cloudflare dashboard → **Workers & Pages → Create → Workers → Connect to Git**
   → pick this repo.
2. Set the build config. This is the part that bites npm-workspaces monorepos:
   the dependency install must run at the **repo root** so it uses the committed
   root `package-lock.json` (there is no lockfile inside `apps/web`). Keeping the
   root directory at the repo root guarantees that:
   - **Root directory:** leave it as the repo root — do **not** set it to
     `apps/web`.
   - **Build command:** `npm run cf-build -w web`
     (runs `opennextjs-cloudflare build` in the `web` workspace)
   - **Deploy command:** `npx wrangler deploy -c apps/web/wrangler.jsonc`
   > Verified locally: `wrangler` resolves the Worker entry (`main`) and the
   > `assets` directory relative to `apps/web/wrangler.jsonc`, so deploying from
   > the repo root with `-c` works. If you instead set Root directory to
   > `apps/web`, Workers Builds installs *inside* `apps/web` where there is no
   > lockfile — avoid that.
3. Add **Build variables / secrets** (see §4) — `NEXT_PUBLIC_*` must be present
   at **build** time because Next inlines them into the client bundle.
4. **Save and Deploy** → you get a `*.workers.dev` URL.

### Option B — deploy from your machine

Requires Node 22+.

```bash
npm install                 # from repo root (workspaces)
npm run deploy -w web       # = opennextjs-cloudflare build && wrangler deploy
```

`wrangler` will prompt you to log in to Cloudflare on first run. To preview the
Workers runtime locally before deploying: `npm run preview -w web`.

## 3. Deploy `apps/api` (GPS backend) → Railway

The Fastify API deploys to **Railway** as a Docker service built from
`apps/api/Dockerfile`. It's Railway-ready as-is: it reads Railway's injected
`PORT` and binds `0.0.0.0` (`apps/api/src/server.ts`).

### Build config (monorepo + Dockerfile)

The Dockerfile builds from the **repo root** (it needs the root
`package-lock.json` + both workspace manifests), so keep the **full repo
context** — do **not** set a restrictive Root Directory. The committed
`railway.json` points Railway at the Dockerfile:

```json
{ "build": { "builder": "DOCKERFILE", "dockerfilePath": "apps/api/Dockerfile" } }
```

(Equivalent CLI: `railway environment edit --service-config <service>
build.builder DOCKERFILE` + `... build.dockerfilePath apps/api/Dockerfile`.)

### First deploy

```bash
# from the repo root — signs you in if needed, creates the project + service,
# builds the Dockerfile, and deploys:
railway up -m "trip-gps-api initial deploy"
```

`railway up --detach` returns at QUEUED — confirm with `railway deployment list
--json` (status `SUCCESS`) before trusting it. Or connect the GitHub repo in the
Railway dashboard for auto-deploy on push. Redeploy after changes with
`railway up -m "<summary>"`.

### Environment variables (Railway → service → Variables)

Set these (full reference: `docs/env-doc.md`). **Do NOT set `PORT`** — Railway
injects it and the app reads it.

```
NODE_ENV=production
TRIP_GPS_ENABLED=1
TRIP_GPS_STORE=supabase
TRIP_GPS_SUPABASE_URL=https://<ref>.supabase.co
TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
TRIP_GPS_OWNER_CODE=<owner-code>
CORS_ORIGINS=https://koonporza.com,https://www.koonporza.com
```

```bash
railway variable set NODE_ENV=production TRIP_GPS_ENABLED=1 --service <service>
# …or paste them in the dashboard. The values are in your apps/api/.env.prod.
```

### Custom domain `api.koonporza.com`

1. Railway → service → **Settings → Networking → Custom Domain** →
   `api.koonporza.com`. Railway shows a `CNAME` target (`<id>.up.railway.app`)
   and issues SSL automatically.
2. Cloudflare → DNS → **CNAME** `api.koonporza.com` → that Railway target.
   Simplest is **DNS-only (grey)** so Railway validates + serves TLS. To keep
   Cloudflare's proxy/WAF (Phase 10), add the domain in Railway first, let it
   issue the cert, then switch the record to **Proxied** with SSL mode **Full**.
3. Verify `https://api.koonporza.com/health` → `{"status":"ok"}`.

> The earlier self-host path (build on `por-dev` via
> `deploy/trip-gps-api/deploy.sh` + `compose.yml`) is superseded by Railway; the
> scripts remain in the repo as an optional fallback.

## 4. Environment variables

Full reference (Thai): `docs/env-doc.md`. Quick summary:

- **Worker (`apps/web`) — set as Workers build vars / secrets:**
  - `NEXT_PUBLIC_TRIP_GPS_API_BASE` = the public Fastify URL,
    e.g. `https://api.koonporza.com` (build-time; inlined into the client).
  - `NEXT_PUBLIC_TRIP_GPS_UI`, `NEXT_PUBLIC_CF_BEACON_TOKEN` (optional).
  - The Worker needs **server** secrets (`TRIP_GPS_SUPABASE_*`,
    `TRIP_GPS_OWNER_CODE`) **only** if you rely on the in-app Next fallback API
    at `app/api/trips/001/*` instead of the external Fastify backend. With
    `NEXT_PUBLIC_TRIP_GPS_API_BASE` set, those routes are dormant. Set runtime
    secrets with `npm exec -w web -- wrangler secret put <NAME>` (or in the
    dashboard) — never commit them.
- **Backend (`apps/api`) — set in Railway** (service → Variables): `CORS_ORIGINS`,
  `TRIP_GPS_ENABLED`, `TRIP_GPS_STORE`, `TRIP_GPS_SUPABASE_*`,
  `TRIP_GPS_OWNER_CODE`. **Do NOT set `PORT`** — Railway injects it and the app
  reads it. Reference values: `apps/api/.env.example` / your `apps/api/.env.prod`.

## Optional: Google motorcycle map (Phase 17)

**Off by default; enabling is opt-in and billed.**

1. **Enable APIs & create two separate API keys** in Google Cloud console:
   - Enable **Routes API** and **Maps JavaScript API**.
   - Create **two separate API keys** (one for each API).

2. **Routes API key** (`GOOGLE_MAPS_ROUTES_API_KEY`):
   - In Google Cloud console, restrict this key to **Routes API only**.
   - Add it as a **server-only** env var on the **Railway backend**
     (never in `NEXT_PUBLIC_*` or frontend).
   - Also set on Railway: `TRIP_GOOGLE_ROUTE_CACHE_TTL_SECONDS` (default `86400`)
     and `TRIP_GOOGLE_ROUTE_DAILY_QUOTA` (cost guard; default `50`).

3. **Maps JavaScript API key** (`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`):
   - In Google Cloud console, restrict this key to **Maps JavaScript API only**.
   - Add an **HTTP-referrer allowlist**: `koonporza.com` and `www.koonporza.com`.
   - Set a **low daily quota** (e.g. 100 requests/day) in the console.
   - Set `NEXT_PUBLIC_TRIP_GOOGLE_MAP_ENABLED=1` + the key in the **frontend env**
     (Vercel / `.env.production`), then redeploy to Cloudflare Workers.

4. **Cost guard**: With both flags off (default), the viewer costs 0฿ and works
   fully on the free MapLibre + BRouter/OSM map. If keys are missing, quota is
   exhausted, or the endpoint fails → automatic fallback to MapLibre (no loss
   of service). Leave both flags off to stay at 0฿ unless you explicitly enable
   the Google mode.

Full env reference: `docs/env-doc.md`.

## 5. Custom domain koonporza.com

With the zone on Cloudflare, attach the domain to the Worker directly (no manual
A/CNAME records, and the route is proxied/orange-cloud automatically):

1. Cloudflare → your Worker (`portfolio-koonporza-web`) → **Settings → Domains &
   Routes → Add → Custom Domain** → `koonporza.com` (and `www`).
2. `api.koonporza.com` points at the Railway backend — see §3's custom-domain
   step (add it in Railway, CNAME it in Cloudflare).
3. SSL is issued automatically (usually minutes).

## 6. Before going live

- [ ] Fill real content in `apps/web/lib/data.ts` (projects, links, bio, email)
- [ ] Replace social `href`s (currently point to bare `github.com` / `x.com`)
- [ ] Add `apps/web/public/resume.pdf` (or remove the resume button in
  `apps/web/lib/data.ts`)
- [ ] Add an OG image: `apps/web/app/opengraph-image.png` (1200×630)
- [ ] Swap `apps/web/public/favicon.ico` for your own
- [ ] Keep `TRIP_GPS_ENABLED` off on the backend until owner tokens are live

## Alt host

Vercel still works (set **Root Directory** to `apps/web`, framework auto-detected
as Next.js) if you ever want to move the frontend off Cloudflare. The OpenNext
config here is additive and does not affect a standard `next build`.
