# Deploy → koonporza.com

Static Next.js app. Recommended host: **Vercel** (auto-detects Next.js, free tier, easy custom domain).

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
2. Framework preset: **Next.js** (auto-detected) — no config needed
3. Build command `next build`, output handled automatically
4. **Deploy** → you get a `*.vercel.app` preview URL

## 3. Custom domain koonporza.com

1. Vercel project → **Settings → Domains** → add `koonporza.com` (and `www`)
2. At your domain registrar, set DNS as Vercel instructs:
   - Apex `koonporza.com` → **A** record `76.76.21.21` (or Vercel's current value shown in the panel)
   - `www` → **CNAME** `cname.vercel-dns.com`
3. Wait for DNS + auto SSL (usually minutes)

## 4. Before going live

- [ ] Fill real content in `lib/data.ts` (projects, links, bio, email)
- [ ] Replace social `href`s (currently point to bare `github.com` / `x.com`)
- [ ] Add `public/resume.pdf` (or remove the resume button in `lib/data.ts`)
- [ ] Add an OG image: `app/opengraph-image.png` (1200×630) for nice link previews
- [ ] Swap `public/favicon.ico` for your own

## Alt hosts

Cloudflare Pages / Netlify also work (Next.js preset). Vercel is the path of least resistance.
