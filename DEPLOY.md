# Deploy → koonporza.com

Two deployables in this monorepo:

- **`apps/web`** — Next.js 16 frontend → **Cloudflare Workers** (via the
  [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare) adapter).
- **`apps/api`** — Fastify GPS backend → a **Node host** (Railway / Render /
  Fly.io). Fastify needs a long-running Node server, so it does **not** run on
  Workers. Cloudflare sits in front of it (see Phase 10).

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

## 3. Deploy `apps/api` (GPS backend)

Deploy `apps/api` separately to a Node host (Railway / Render / Fly.io). A
`Dockerfile` is included for hosts that prefer containers. Free tiers can
cold-start, which is acceptable for the MVP — do not add a paid plan without
asking first.

Set backend env in the host (start from `apps/api/.env.example`), and include
`CORS_ORIGINS` with the deployed frontend origin(s), e.g.
`https://koonporza.com,https://www.koonporza.com`.

> Optional: Cloudflare **Containers** can run the included `apps/api/Dockerfile`
> if you want the backend on Cloudflare too. Not required for the MVP; the
> Node-host + Cloudflare-proxy path above is simpler and already planned.

## 4. Environment variables

Full reference (Thai): `docs/trip-gps-env-vars.md`. Quick summary:

- **Worker (`apps/web`) — set as Workers build vars / secrets:**
  - `NEXT_PUBLIC_TRIP_GPS_API_BASE` = the public Fastify URL,
    e.g. `https://api.koonporza.com` (build-time; inlined into the client).
  - `NEXT_PUBLIC_TRIP_GPS_UI`, `NEXT_PUBLIC_CF_BEACON_TOKEN` (optional).
  - The Worker needs **server** secrets (`TRIP_GPS_SUPABASE_*`,
    `TRIP_GPS_OWNER_CODE*`) **only** if you rely on the in-app Next fallback API
    at `app/api/trips/001/*` instead of the external Fastify backend. With
    `NEXT_PUBLIC_TRIP_GPS_API_BASE` set, those routes are dormant. Set runtime
    secrets with `npm exec -w web -- wrangler secret put <NAME>` (or in the
    dashboard) — never commit them.
- **Backend (`apps/api`) — set on the Node host:** `CORS_ORIGINS`,
  `TRIP_GPS_ENABLED`, `TRIP_GPS_STORE`, `TRIP_GPS_SUPABASE_*`,
  `TRIP_GPS_OWNER_CODE_HASH`. See `apps/api/.env.example`.

## 5. Custom domain koonporza.com

With the zone on Cloudflare, attach the domain to the Worker directly (no manual
A/CNAME records, and the route is proxied/orange-cloud automatically):

1. Cloudflare → your Worker (`portfolio-koonporza-web`) → **Settings → Domains &
   Routes → Add → Custom Domain** → `koonporza.com` (and `www`).
2. Point `api.koonporza.com` at the Fastify backend host and set it to
   **Proxied** (see `plans/feature-gps/phase-10-cloudflare-edge.md`).
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
