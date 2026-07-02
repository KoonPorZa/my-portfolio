# Phase 12 — Weather (realtime + departure-day forecast)

**Priority:** P2 · **Branch:** `feat/gps` · **Depends on:** Phase 6 (viewer), the roadbook `trip-client.tsx`
**Read first:** `phase-00-overview.md` (guardrails). Monorepo: the Next app is in `apps/web/`.

## Goal
Add weather to the trip, from **Open-Meteo** (free, **no API key, no new npm dependency**, fetched client-side):
1. **Realtime** current weather at the rider's latest GPS point — on the viewer page `/trip/001/live`.
2. **Departure-day forecast** for **2026-07-13** at each of the 10 roadbook stops, aligned to the planned arrival time — on the roadbook `/trip/001`.

Cost = 0฿. No secret. No backend changes. This is frontend-only (`apps/web`).

## DESIGN SYSTEM (IMPORTANT — read before styling)
These weather widgets live on the **trip pages**, which use the **trip's own
self-contained "rally roadbook" design system** (CSS Modules + warm tokens),
**NOT** the portfolio's neon/HUD Tailwind theme. Do **NOT** use Tailwind neon
utilities here (`bg-panel`, `bg-elevated`, `border-line`, `text-cyan/lime/magenta`,
`font-mono`, `shadow-[var(--glow-*)]`). Instead use CSS Modules that reference the
trip tokens, which cascade from `.tripRoot` (roadbook) / `.liveRoot` (viewer):
`--paper #f3ecdd · --card #fbf6ec · --card-2 · --ink #211b13 · --ink-soft · --muted #8c7d63 ·
--line #e2d6bd · --line-strong · --accent #cf451c (signal orange) · --accent-deep ·
--accent-tint · --rest #2f6b41 (green) · --rest-tint · --danger #ad2730 · --danger-tint ·
--radius 18px · --shadow-soft · fonts --trip-sans / --trip-mono`.
Match the look of the existing roadbook/viewer cards in `trip.module.css` /
`live.module.css`. Color-code weather with the trip accents (e.g. --rest green for
clear/mild, --accent orange for heat/heavy rain warnings, --danger red for storms,
--muted for labels) — never cyan/lime/magenta.

## Data source — Open-Meteo (https://api.open-meteo.com/v1/forecast)
- **Current (realtime):**
  `?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=auto`
- **Hourly forecast for the stops on the departure day** — ONE request for all 10 stops (Open-Meteo accepts comma-separated coords → response is an ARRAY, one object per location; handle both array and single-object shapes):
  `?latitude={lat1,lat2,…}&longitude={lon1,lon2,…}&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m&start_date=2026-07-13&end_date=2026-07-13&timezone=Asia/Bangkok`
  For each stop, pick the hourly index whose time matches the stop's planned **arrive** hour (round to nearest hour).
- No key, CORS-enabled — call directly from the browser. Be polite: cache in component state; don't refetch on every render.

## Files (all under apps/web)
- **create** `apps/web/lib/weather.ts` — pure helpers, no React:
  - `fetchCurrentWeather(lat, lon, signal?)` → normalized `{ tempC, feelsLikeC, humidity, precipMm, windKmh, code }`.
  - `fetchStopsForecast(points: {lat,lon}[], date: "2026-07-13")` → `Array<HourlySeries>` aligned to input order.
  - `pickForecastAtHour(series, hhmm)` → `{ tempC, precipProb, windKmh, code }` for the matching hour (or null).
  - `describeWeather(code: number)` → `{ label: string /* Thai */, icon: string /* emoji or short glyph */, tone: "clear"|"cloud"|"rain"|"storm"|"fog" }` — map WMO codes (see below).
  - `WEATHER_FORECAST_DATE = "2026-07-13"`, `WEATHER_FORECAST_MAX_DAYS = 16`.
- **create** `apps/web/components/weather-now.tsx` — `"use client"` card. Props `{ lat, lon }` (nullable). Fetches current weather; refetches when the point moves > ~5 km OR every 10 min; aborts in-flight on unmount/prop change. States: loading / error / data. Styled with the **trip design system** (see above) via a `weather-now.module.css` referencing the trip tokens — match the viewer's existing cards in `live.module.css`.
- **modify** `apps/web/app/trip/001/live/live-viewer.tsx` — render `<WeatherNow lat={latest.lat} lon={latest.lng} />` next to the "ตำแหน่งล่าสุด" card; only when there's a `latest` point.
- **modify** `apps/web/app/trip/001/trip-client.tsx` — on mount (client), fetch `fetchStopsForecast` for the 10 stop coords; store in state; in each `StopRow` show the forecast at that stop's planned `arrive` (temp, condition icon+label, ฝน%); add a one-line route summary near the top (e.g. "13 ก.ค. · ส่วนใหญ่ <สภาพเด่น> · ฝนหนักสุดแถว <stop>"). Keep the page a static shell — weather hydrates client-side. Handle: loading, error, and **out-of-range** (if today is >16 days before the date or after it → show "ยังไม่มีข้อมูลพยากรณ์ / ใกล้วันเดินทางจะแม่นขึ้น").

## WMO weather_code → Thai (describeWeather)
0 ท้องฟ้าโปร่ง ☀️ · 1–2 มีเมฆบางส่วน 🌤️ · 3 เมฆมาก ☁️ · 45/48 หมอก 🌫️ ·
51/53/55 ฝนปรอย 🌦️ · 61/63/65 ฝนตก 🌧️ · 66/67 ฝนเยือกแข็ง 🌧️ · 71/73/75/77 หิมะ 🌨️ ·
80/81/82 ฝนซู่ 🌦️ · 95 พายุฝนฟ้าคะนอง ⛈️ · 96/99 พายุฝนฟ้าคะนองมีลูกเห็บ ⛈️. (Tone groups as above.)

## Tasks
1. `lib/weather.ts` helpers + WMO map + the two fetchers (typed, no `any`; narrow the JSON).
2. `WeatherNow` card with move/interval refresh + abort + loading/error states; on-theme.
3. Wire into the viewer (realtime) and the roadbook stop rows + summary (forecast).
4. All copy in Thai, matching the existing trip tone.

## Acceptance criteria
- [ ] Viewer shows current weather at the rider's latest point; updates as the location moves; degrades gracefully if Open-Meteo is unreachable (no crash, shows a quiet error/empty state).
- [ ] Roadbook shows, per stop, the 2026-07-13 forecast at the planned arrival hour + a route summary; out-of-range/error states handled.
- [ ] No API key, no `NEXT_PUBLIC_*` secret, no new npm dependency. `apps/web` lint + type-check pass.
- [ ] No server-only import leaks into client components.

## Out of scope
- Backend changes, persistence, the planned-vs-actual timeline (Phase 13).
- Paid weather providers, map tiles, radar overlays.
