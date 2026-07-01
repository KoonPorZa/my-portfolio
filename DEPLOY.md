# Deploy → koonporza.com

Two deployables in this monorepo:

- **`apps/web`** — Next.js 16 frontend → **Cloudflare Workers** (via the
  [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare) adapter).
- **`apps/api`** — Fastify GPS backend → a **Docker container on `por-dev`**,
  deployed with one command from your machine (`deploy/trip-gps-api/deploy.sh`,
  see §3). Fastify needs a long-running Node server, so it does **not** run on
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

The Fastify API runs as a Docker container on **`por-dev`** (linux/amd64),
fronted by Nginx Proxy Manager at `api.koonporza.com`. Deploy it with one command
**from your machine**:

```bash
./deploy/trip-gps-api/deploy.sh
```

Because `por-dev` is amd64 and your machine may be arm64, the script **builds on
the server** (no cross-arch juggling, no registry). It:

1. `rsync`s the source to `por-dev` (excluding `node_modules`, `.git`, `.env*`);
2. ships `deploy/trip-gps-api/compose.yml` and `apps/api/.env.prod` (as the
   container's server-local `.env`);
3. runs `docker build` + `docker compose up -d` on `por-dev`;
4. health-checks `/health`.

Override the target with `DEPLOY_SSH_HOST=` / `DEPLOY_DIR=` if needed.

### Prerequisites (one-time)

- **SSH access** to `por-dev` through the jump host. Add an alias to
  `~/.ssh/config` so `ssh por-dev` works:

  ```
  Host por-jump
    HostName <jump-host>
    User <jump-user>

  Host por-dev
    HostName 192.168.248.17
    User dev
    ProxyJump por-jump
  ```

- **Docker + Docker Compose** on `por-dev`, plus the external Docker network
  `nginx-proxy-manager_default` (created by the Nginx Proxy Manager stack).
- **`apps/api/.env.prod`** filled in — gitignored, created from
  `apps/api/.env.example`. `TRIP_GPS_OWNER_CODE` is required; keep `PORT=3000`
  and start with `TRIP_GPS_STORE=memory` until Supabase creds are set. The script
  refuses to deploy while required values are empty or still placeholders.

### Fixed facts (keep aligned)

- **Networking:** the API attaches to the external network
  `nginx-proxy-manager_default`.
- **Port:** `expose: "3000"` only (no host `ports`). `PORT` must be `3000` so the
  NPM target `trip-gps-api:3000`, the `EXPOSE`, and the healthcheck all match.
- **Secrets:** live only in `apps/api/.env.prod` locally and the server-local
  `.env` — never committed (both matched by the `.env*` gitignore rule).

### After the first deploy (owner, in Nginx Proxy Manager)

Create a proxy host for `api.koonporza.com` → `trip-gps-api:3000` on the
`nginx-proxy-manager_default` network, enable SSL, keep the Cloudflare DNS record
proxied, and verify `https://api.koonporza.com/health`.

> **Warning:** `por-dev` already has services bound to public ports, including
> Redis on `6379`. Before using it as a public production host, restrict public
> access to unrelated services with firewall rules or Docker network changes.

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
- **Backend (`apps/api`) — set in `apps/api/.env.prod`** (gitignored; shipped to
  `por-dev` as the container's `.env` by `deploy.sh`): `CORS_ORIGINS`,
  `TRIP_GPS_ENABLED`, `TRIP_GPS_STORE`, `TRIP_GPS_SUPABASE_*`,
  `TRIP_GPS_OWNER_CODE`. Template: `apps/api/.env.example`.

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
