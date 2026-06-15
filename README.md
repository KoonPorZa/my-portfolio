# koonporza.com

Personal portfolio + link-in-bio. **Gaming / neon-dark** cyberpunk aesthetic — glitch wordmark, terminal typing, scanlines, neon glow.

Built with **Next.js 16** (App Router, Turbopack) · **Tailwind CSS v4** · **Motion** · TypeScript.

## Stack & design

- Fonts: **Chakra Petch** (display + body, Thai-capable) · **JetBrains Mono** (terminal/mono)
- Colors: void `#07070b` + neon cyan `#2ff3ff` / magenta `#ff2e97` / lime `#b4f53c`
- Design system → `DESIGN.md` · Build plan → `PLAN.md`

## Edit your content

Everything you'd change lives in one file:

```
lib/data.ts   ← name, role, bio, stack, skills, projects, links, email
```

Drop a `resume.pdf` in `public/` to enable the resume button (or remove it from `lib/data.ts`).

> ⚠️ Current projects, social links and bio are **placeholders** — swap them in `lib/data.ts`.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

## Structure

```
app/            layout (fonts/meta), page (composition), globals.css (tokens + keyframes)
components/     nav, hero, about, projects, project-card, links, footer
components/ui/  grain, scanline+vignette, reveal (motion), glow-button, social-icon
lib/data.ts     ← all editable content
```

## Deploy

See `DEPLOY.md` — push to GitHub, import on Vercel, point `koonporza.com` at it.
