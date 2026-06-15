# koonporza.com — Build Plan

> Personal portfolio + link-in-bio for **koonporza.com**
> Aesthetic: **Gaming / Neon dark** — near-black canvas, neon cyan + magenta glow, terminal/cyberpunk vibe.

---

## 1. Goal

หน้าเว็บเดียว (single landing) ที่รวม 3 อย่าง:

1. **Portfolio** — โชว์ projects / ผลงานเด่น
2. **Link-in-bio** — รวม social + link ทุกอย่าง แทน Linktree แต่เป็น domain ตัวเอง
3. **About / resume** — แนะนำตัว, tech stack, ช่องทางติดต่อ

Blog เก็บไว้เฟสหลัง (เผื่อขยายเป็น `/blog` ด้วย MDX ทีหลัง).

---

## 2. Tech Stack

| Layer       | Choice                                  | เหตุผล |
|-------------|-----------------------------------------|--------|
| Framework   | **Next.js 15** (App Router, TypeScript) | SEO, deploy Vercel ง่าย, ต่อ domain ง่าย |
| Styling     | **Tailwind CSS v4**                     | utility-first, theme ผ่าน CSS vars |
| Animation   | **Motion** (framer-motion)              | staggered load, hover glow, terminal typing |
| Icons       | **lucide-react** + custom SVG           | เบา, ปรับสีง่าย |
| Deploy      | **Vercel**                              | ฟรี, preview URL, ต่อ custom domain |
| Font host   | **next/font** (Google Fonts, self-host) | เร็ว, ไม่มี layout shift |

---

## 3. Design System → ดู `DESIGN.md`

สรุปสั้น:
- **BG:** near-black `#07070b` + grain overlay + radial glow
- **Accent:** neon cyan `#00f0ff` / magenta `#ff2e97` / lime `#b6ff3c`
- **Display font:** Chakra Petch (รองรับไทย + techy)
- **Mono font:** JetBrains Mono (terminal feel)
- **Body font:** IBM Plex Sans Thai (อ่านไทยสบาย)
- **Motion:** glitch name, typing tagline, scanline, hover glow, staggered reveal

---

## 4. Page Sections (single page, scroll)

```
┌─ Nav (sticky) ─ logo "koonporza" · online dot · [projects][about][links] ─┐
│                                                                          │
│  HERO                                                                    │
│   ▓▓ KOONPORZA ▓▓   ● online                                             │
│   > building cool stuff_   (typing effect)                              │
│   [ view work ]  [ contact ]                                            │
│                                                                          │
│  ABOUT / RESUME                                                          │
│   bio + tech stack chips + skill bars (▰▰▰▰▱)                            │
│   [ download resume ]                                                    │
│                                                                          │
│  PROJECTS                                                                │
│   grid ของ cards (hover → glow + lift)                                   │
│   แต่ละ card: thumbnail, title, stack tags, link                        │
│                                                                          │
│  LINKS (link-in-bio)                                                     │
│   grid ปุ่ม: GitHub · X · IG · YouTube · Discord · Email                 │
│                                                                          │
│  FOOTER                                                                  │
│   © koonporza · built with Next.js · neon divider                       │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 5. File Structure (target)

```
portfolio-koonporza/
├─ PLAN.md                  ← this file
├─ DESIGN.md                ← design system / tokens
├─ app/
│  ├─ layout.tsx            ← fonts, metadata, grain overlay
│  ├─ page.tsx              ← compose sections
│  └─ globals.css           ← tailwind + CSS vars + keyframes
├─ components/
│  ├─ nav.tsx
│  ├─ hero.tsx              ← glitch + typing
│  ├─ about.tsx             ← bio + skill bars
│  ├─ projects.tsx          ← project grid
│  ├─ project-card.tsx
│  ├─ links.tsx             ← link-in-bio grid
│  ├─ footer.tsx
│  └─ ui/
│     ├─ glow-button.tsx
│     ├─ scanline.tsx
│     └─ grain.tsx
├─ lib/
│  └─ data.ts               ← projects[], links[], profile (แก้ที่เดียว)
├─ public/
│  └─ (thumbnails, og image, resume.pdf)
└─ ...config (next, tailwind, ts)
```

> ข้อมูลทั้งหมด (ชื่อ, bio, projects, links) แยกไว้ใน `lib/data.ts` — แก้ที่เดียว ไม่ต้องไปยุ่ง UI.

---

## 6. Build Phases

- [ ] **P0 — Scaffold**
  - `create-next-app` (TS, Tailwind v4, App Router, ESLint)
  - ติดตั้ง `motion`, `lucide-react`
  - ตั้ง fonts ผ่าน `next/font`

- [ ] **P1 — Design foundation**
  - `globals.css`: CSS vars (colors), keyframes (glow, scan, glitch, blink)
  - grain + scanline overlay components
  - test theme บนหน้าเปล่า

- [ ] **P2 — Sections (static)**
  - Nav → Hero → About → Projects → Links → Footer
  - ใส่ placeholder data ใน `lib/data.ts`

- [ ] **P3 — Motion**
  - hero typing + glitch
  - staggered reveal ตอน scroll (Motion `whileInView`)
  - hover glow บน cards + buttons

- [ ] **P4 — Content + polish**
  - ใส่ projects/links จริง
  - responsive (mobile-first), a11y (focus ring, reduced-motion)
  - OG image + metadata + favicon

- [ ] **P5 — Deploy**
  - push → Vercel → ต่อ `koonporza.com`

---

## 7. UI/UX Skills ที่จะใช้ (ตามที่หา)

| Skill                         | ใช้ทำอะไร |
|-------------------------------|-----------|
| **frontend-design** (active)  | ทิศทาง aesthetic, หนีงาน AI-slop, typography/motion/composition |
| **ui-ux-pro-max**             | คลัง styles, color palettes, font pairings, UX guidelines, chart types |
| **tailwind-design-system**    | design tokens + scalable Tailwind v4 patterns |
| **shadcn**                    | (option) primitives ที่ accessible แล้วเอามาทาสีเอง |

---

## 8. Non-goals (เฟสนี้)

- Blog / CMS (ไว้เฟสหลัง)
- i18n เต็มรูปแบบ (เริ่ม TH/EN ผสมพอ)
- Backend / DB (static ล้วน)

---

## Next step

`P0 — Scaffold`: รัน `create-next-app` ในโฟลเดอร์นี้ แล้วต่อด้วย design foundation.
