# koonporza.com

Personal portfolio + link-in-bio. **Gaming / neon-dark** cyberpunk aesthetic —
glitch wordmark, terminal typing, scanlines, neon glow.

Built with **Next.js 16** (App Router, Turbopack) · **Tailwind CSS v4** ·
**Motion** · TypeScript.

This repo is an npm workspace: `apps/web` is the Next frontend, and `apps/api`
is the Fastify GPS backend.

## Stack & design

- Fonts: **Chakra Petch** (display + body, Thai-capable) · **JetBrains Mono**
  (terminal/mono)
- Colors: void `#07070b` + neon cyan `#2ff3ff` / magenta `#ff2e97` / lime `#b4f53c`
- Design system → `DESIGN.md` · Build plan → `PLAN.md`

## Edit your content

Everything you'd change lives in one file:

```
apps/web/lib/data.ts   ← name, role, bio, stack, skills, projects, links, email
```

Drop a `resume.pdf` in `apps/web/public/` to enable the resume button (or
remove it from `apps/web/lib/data.ts`).

> ⚠️ Current projects, social links and bio are **placeholders** — swap them in
> `apps/web/lib/data.ts`.

## Develop

```bash
npm install       # installs all workspaces
npm run dev       # frontend, http://localhost:3000
npm run dev:api   # backend
npm run build     # frontend production build
npm run build:api # backend build
npm run test:api  # backend tests
```

## Structure

```
apps/web/        Next frontend
apps/api/        Fastify GPS backend
apps/web/app/    layout (fonts/meta), page (composition), globals.css
apps/web/components/     nav, hero, about, projects, project-card, links, footer
apps/web/components/ui/  grain, scanline+vignette, reveal (motion), glow-button, social-icon
apps/web/lib/data.ts     ← all editable content
```

## Deploy

See `DEPLOY.md` — push to GitHub, deploy `apps/web` to **Cloudflare Workers**, point `koonporza.com` at it.
