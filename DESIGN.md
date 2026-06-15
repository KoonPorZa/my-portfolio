# koonporza.com — Design System

> Aesthetic direction: **Gaming / Neon dark** — cyberpunk terminal energy, near-black canvas, electric neon accents, subtle grain + scanline for atmosphere. Bold but not noisy.

---

## 1. Color Tokens

```css
/* globals.css — :root */
--bg-void:      #07070b;   /* page background, near-black */
--bg-panel:     #0e0e16;   /* cards / panels */
--bg-elevated:  #15151f;   /* hover surfaces */

--line:         #1f1f2e;   /* hairline borders */
--line-glow:    #2a2a44;   /* lit borders */

--text-hi:      #eef0ff;   /* headings */
--text:         #b8bcd0;   /* body */
--text-dim:     #6b7088;   /* captions / meta */

--cyan:         #00f0ff;   /* primary neon accent */
--magenta:      #ff2e97;   /* secondary accent */
--lime:         #b6ff3c;   /* online / success */

--glow-cyan:    0 0 24px rgba(0,240,255,.45);
--glow-magenta: 0 0 24px rgba(255,46,151,.45);
```

**Rule:** dominant = void black. Accents = sharp, used sparingly (เส้น, glow, status, CTA). อย่าเกลี่ยสีเท่ากันทุกที่ — neon เด่นเพราะมีน้อย.

---

## 2. Typography

| Role     | Font                 | Notes |
|----------|----------------------|-------|
| Display  | **Chakra Petch**     | techy, geometric, **รองรับไทย** — ใช้กับ headings, logo |
| Mono     | **JetBrains Mono**   | terminal lines, tags, `> prompt_`, code-ish labels |
| Body     | **IBM Plex Sans Thai** | อ่านไทย/อังกฤษสบาย — paragraph, bio |

- Heading: tracking แน่น (`letter-spacing: -0.02em`), uppercase บางจุด
- Mono: ใช้กับ status, kbd, tag chips, ตัวเลข
- หลีกเลี่ยง Inter/Roboto/Arial เด็ดขาด

---

## 3. Motion

| Effect            | ใช้ที่ไหน | how |
|-------------------|-----------|-----|
| Typing            | hero tagline `building cool stuff_` | step reveal + blinking cursor |
| Glitch            | logo / name ตอน load + hover | clip-path + RGB split (cyan/magenta) |
| Scanline          | ทั้งหน้า (overlay บางๆ) | CSS linear-gradient + slow translateY |
| Grain             | ทั้งหน้า | SVG/noise PNG, `mix-blend: overlay`, opacity ~5% |
| Staggered reveal  | sections ตอน scroll | Motion `whileInView`, delay เรียง |
| Hover glow + lift | cards / buttons | `translateY(-4px)` + box-shadow glow + border-glow |
| Online pulse      | status dot | lime dot + pulsing ring |

> รองรับ `prefers-reduced-motion`: ปิด glitch/scan, เหลือ fade เบาๆ.

---

## 4. Components (style spec)

- **Glow button:** transparent bg, neon border, hover → fill glow + text ติดสี void. Variant: cyan (primary) / magenta (secondary).
- **Project card:** panel bg, hairline border, mono stack-tags, hover → border-glow + lift + thumbnail brighten.
- **Skill bar:** `▰▰▰▰▱` style — segmented neon bar, fill animate ตอน in-view.
- **Link tile:** square-ish, icon + label mono, hover → accent glow ตาม brand.
- **Nav:** sticky, blur backdrop, online dot, active section underline (neon).

---

## 5. Spacing / Layout

- Container: `max-w-5xl`, generous vertical rhythm (`py-24`+ ระหว่าง section)
- Grid: 12-col mental model; projects = 2–3 col responsive
- เล่น asymmetry + เส้น divider เรืองแสงคั่น section
- Mobile-first; ทุกอย่าง degrade สวยบนจอเล็ก

---

## 6. Atmosphere checklist (กัน AI-slop)

- [x] Dark void bg ไม่ใช่สีเทาเรียบ → มี radial glow + grain
- [x] Font มีคาแรกเตอร์ (Chakra Petch ไม่ใช่ Inter)
- [x] Accent เด่นเพราะใช้น้อย ไม่ใช่ gradient ม่วงเต็มจอ
- [x] มี signature moment: glitch name + typing terminal
- [x] Micro-detail: scanline, cursor blink, online pulse, hover glow
