# Deploy → koonporza.com

Next.js frontend. Recommended host: **Vercel** (auto-detects Next.js, free
tier, easy custom domain).

## 1. Push to GitHub

After you create the blank repo:

```bash
git remote add origin git@github.com:<you>/portfolio-koonporza.git
git branch -M main
git push -u origin main
```

(Repo is already `git init`'d with an initial commit — just add the remote and push.)

## 2. Import on Vercel

1. vercel.com → **Add New… → Project** → import the repo
2. Set **Project Settings → Build & Deployment → Root Directory** to `apps/web`
3. Framework preset: **Next.js** (auto-detected)
4. Build command: `next build`
5. Install command: use the default root install so npm workspaces install from
   the repo root.
6. Set `NEXT_PUBLIC_TRIP_GPS_API_BASE` to the public Fastify backend URL, for
   example `https://api.koonporza.com`. Leave it empty only when using
   same-origin Next fallback routes.
7. **Deploy** → you get a `*.vercel.app` preview URL

## 2b. Deploy the GPS API

Deploy `apps/api` separately to a Node host such as Railway, Render, or Fly.io.
Free tiers can cold-start, which is acceptable for the MVP. Do not add a paid
plan without asking first.

Set backend environment variables in `apps/api/.env` for local runs, or in the
backend host for production. Start from `apps/api/.env.example`, and include
`CORS_ORIGINS` with the deployed frontend origin(s).

## 3. Custom domain koonporza.com

1. Vercel project → **Settings → Domains** → add `koonporza.com` (and `www`)
2. At your domain registrar, set DNS as Vercel instructs:
   - Apex `koonporza.com` → **A** record `76.76.21.21` (or Vercel's current value shown in the panel)
   - `www` → **CNAME** `cname.vercel-dns.com`
3. Wait for DNS + auto SSL (usually minutes)

## 4. Before going live

- [ ] Fill real content in `apps/web/lib/data.ts` (projects, links, bio, email)
- [ ] Replace social `href`s (currently point to bare `github.com` / `x.com`)
- [ ] Add `apps/web/public/resume.pdf` (or remove the resume button in
  `apps/web/lib/data.ts`)
- [ ] Add an OG image: `apps/web/app/opengraph-image.png` (1200×630) for nice
  link previews
- [ ] Swap `apps/web/public/favicon.ico` for your own

## Alt hosts

Cloudflare Pages / Netlify also work (Next.js preset). Vercel is the path of
least resistance.
