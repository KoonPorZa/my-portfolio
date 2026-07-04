# Environment variables

สรุป environment variables ของ repo นี้ และ **แต่ละค่าต้องเอามาจากไหน**. แยกตาม
service: `apps/web` (Next.js frontend, deploy บน **Cloudflare Workers**) และ
`apps/api` (Fastify backend, deploy บน **Railway** แบบ Docker).

ค่า secret ต้องอยู่ฝั่ง server / backend host เท่านั้น — **ห้ามใส่ secret ใน
`NEXT_PUBLIC_*`** เพราะค่าพวกนั้นถูก inline ลง browser bundle.

Template: `apps/web/.env.example` และ `apps/api/.env.example`.

## ตั้งค่าที่ไหน (ตาม environment)

| ที่ | ตั้งยังไง |
| --- | --- |
| Frontend production (Cloudflare Workers) | **`NEXT_PUBLIC_*`** = Workers Builds → **Build variables** (ต้องมีตอน build เพราะ Next inline เข้า bundle). ค่าฝั่ง server (`GITHUB_TOKEN`, `YOUTUBE_API_KEY`, GPS fallback) = Worker → **Settings → Variables and Secrets** (อ่านตอน run เช่น ISR / route handler); ความลับใช้ `wrangler secret put <NAME>` |
| Backend production (Railway) | ตั้งใน **Railway → service → Variables** (อย่าตั้ง `PORT` — Railway inject ให้เอง แล้ว app อ่านค่าเอง) |
| Local frontend | `apps/web/.env.local` (copy จาก `.env.example`) |
| Local backend | `apps/api/.env` (copy จาก `.env.example`) |

---

## Frontend — `apps/web`

### Public (ส่งถึง browser, ตั้งตอน build)

| Key | Required | ตัวอย่าง | เอามาจากไหน / ใช้ทำอะไร |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_TRIP_GPS_API_BASE` | เมื่อใช้ Fastify backend | `https://api.koonporza.com` | base URL ของ Fastify backend ที่คุณ deploy (`apps/api`) — ใส่โดเมน/URL ที่ host ให้มา (ไม่มี trailing slash). เว้นว่าง = ใช้ Next fallback API บน origin เดียวกัน |
| `NEXT_PUBLIC_TRIP_GPS_UI` | Optional | `0` / `1` | แค่ค่าที่คุณตั้งเอง: `1` โชว์ UI GPS, `0` ซ่อน. เป็น UI flag ไม่ใช่ auth |
| `NEXT_PUBLIC_CF_BEACON_TOKEN` | Optional | hex token | Cloudflare Web Analytics token — ดูวิธีเอาด้านล่าง |

### Server-only — social stats (optional, ใช้ในหน้า home)

| Key | Required | เอามาจากไหน / ใช้ทำอะไร |
| --- | --- | --- |
| `GITHUB_TOKEN` | Optional | GitHub personal access token — ดูวิธีเอาด้านล่าง. ใช้เพิ่ม rate limit ตอน fetch GitHub stats. ถ้าไม่ตั้งก็ยัง fetch ได้แต่ติด rate limit เร็วกว่า |
| `YOUTUBE_API_KEY` | Optional | Google Cloud YouTube Data API key — ดูวิธีเอาด้านล่าง. ใช้ดึง YouTube channel stats. ไม่ตั้ง = tile fallback เป็น static link |

### Server-only — Next GPS fallback API

อ่านเฉพาะเมื่อ `NEXT_PUBLIC_TRIP_GPS_API_BASE` **ว่าง** (รัน GPS โดยไม่มี Fastify
backend, เช่น local). ถ้าใช้ backend จริง ให้ตั้งค่าพวกนี้ที่ `apps/api` แทน.

| Key | Required | เอามาจากไหน / ใช้ทำอะไร |
| --- | --- | --- |
| `TRIP_GPS_ENABLED` | Yes (fallback) | ค่าที่ตั้งเอง: `1` เปิด fallback GPS API, `0` ปิด. (ต้องเป็น `1` **และ** มี Supabase env ครบถึงจะ enable จริง) |
| `TRIP_GPS_STORE` | Optional | ค่าที่ตั้งเอง: `auto` / `supabase` / `mock` / `memory` (ดูตาราง Store mode) |
| `TRIP_GPS_SUPABASE_URL` | Yes for Supabase | Supabase Project URL — ดูวิธีเอาด้านล่าง |
| `TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY` | Yes for Supabase | Supabase `service_role` secret — ดูวิธีเอาด้านล่าง |
| `TRIP_GPS_OWNER_CODE` | Yes (fallback) | รหัส owner แบบ plaintext ที่ใช้เริ่ม/หยุดแชร์ — ดูด้านล่าง |

### Optional: Google motorcycle map (Phase 17)

> 📌 **Google Cloud project ที่ใช้ชื่อ `jadkarnmoney`** — ไม่ได้ตั้งชื่อตาม repo นี้
> เป็น project เก่าที่หยิบมาใช้ต่อเพราะเปิด billing ไว้แล้ว
> เวลาเข้า console.cloud.google.com ให้เลือก project นี้ (key/quota ของ maps อยู่ในนั้นทั้งหมด)

Backend (server-only, `apps/api` — **ห้าม** prefix `NEXT_PUBLIC_*`):

| Key | Required | เอามาจากไหน / ใช้ทำอะไร |
| --- | --- | --- |
| `GOOGLE_MAPS_ROUTES_API_KEY` | Optional | Google **Routes API** key. Server-only. ใช้ให้ backend ดึง `TWO_WHEELER` motorcycle route. ถ้าไม่ตั้ง feature ปิด และ API ตอบ `{fallback:true}`. **ห้ามใส่ `NEXT_PUBLIC_*`** |
| `TRIP_GOOGLE_ROUTE_CACHE_TTL_SECONDS` | Optional | Cache TTL ของ Google route (วินาที). Default `86400` (1 วัน). Route fixed ต่อ trip ⇒ upstream call ไม่กี่ครั้ง |
| `TRIP_GOOGLE_ROUTE_DAILY_QUOTA` | Optional | Max Google Routes upstream calls per UTC day (cost guard). Default `50`. `0` = ปิด upstream, fallback เสมอ |

Frontend (public, `apps/web`, build-time — inline ลง client):

| Key | Required | เอามาจากไหน / ใช้ทำอะไร |
| --- | --- | --- |
| `NEXT_PUBLIC_TRIP_GOOGLE_MAP_ENABLED` | Optional | Feature flag. `0` (default) = off, ใช้ free MapLibre map. `1` = แสดง Google map toggle (ต้องมี browser key ด้วย) |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | Optional | Google **Maps JavaScript API** key. Public (ไป browser) แต่ **ต้อง restrict โดย HTTP referrer + low quota** ใน Google Cloud console. **Separate key** จาก `GOOGLE_MAPS_ROUTES_API_KEY` |

**Default state (ทั้ง flag ปิด, ไม่มี keys) = 0฿ cost** และทำงานเต็มที่บน MapLibre + BRouter/OSM. Google mode opt-in และมีค่าใช้งาน.

---

## Backend — `apps/api`

| Key | Required | เอามาจากไหน / ใช้ทำอะไร |
| --- | --- | --- |
| `NODE_ENV` | Recommended | ค่าที่ตั้งเอง: `production` บน host จริง (เปิด fail-fast), `development` ตอน local |
| `PORT` | มักได้จาก host | port ที่ backend listen — host ส่วนใหญ่ inject ให้เอง. local default `3000` |
| `CORS_ORIGINS` | Yes | origin ของ frontend ที่อนุญาตให้เรียก API (comma-separated, ไม่มี trailing slash). ใส่โดเมนเว็บ production + `http://localhost:3000` ตอน dev |
| `TRIP_GPS_ENABLED` | Yes | ค่าที่ตั้งเอง: `1` เปิด GPS server, `0` ปิด |
| `TRIP_GPS_STORE` | Yes | ค่าที่ตั้งเอง: prod แนะนำ `supabase` (fail fast ถ้า env ไม่ครบ) |
| `TRIP_GPS_SUPABASE_URL` | Yes for Supabase | Supabase Project URL — ดูวิธีเอาด้านล่าง |
| `TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY` | Yes for Supabase | Supabase `service_role` secret — ดูวิธีเอาด้านล่าง |
| `TRIP_GPS_OWNER_CODE` | Yes | รหัส owner แบบ plaintext ที่ใช้เริ่ม/หยุดแชร์ — ดูด้านล่าง |

### API hardening + proxy (Phase 14) — optional, มี default ปลอดภัย

| Key | Required | เอามาจากไหน / ใช้ทำอะไร |
| --- | --- | --- |
| `TRUST_PROXY` | Optional | กี่ proxy hop ที่เชื่อเพื่อหา client IP จริง. Default `1` = Railway (DNS-only). ตั้ง `2` **เฉพาะ**เมื่อ `api.koonporza.com` ถูก Cloudflare **Proxied** (orange). **ห้ามตั้ง `true`** — จะเชื่อ `x-forwarded-for` ที่ client ปลอมได้ ทำให้ per-IP rate limit ถูก bypass. ตั้งผิด hop = ทุก client รวมเป็น bucket เดียว (เจอ false 429). ตรวจได้โดย log `request.ip` เทียบกับ IP client จริงบน host |
| `BODY_LIMIT_BYTES` | Optional | ขนาด request body สูงสุด (byte). Default `16384`. เกิน → `413` ก่อนถึง handler/store |
| `RATE_LIMIT_WINDOW` | Optional | หน้าต่างเวลาของ rate limit. Default `1 minute` |
| `RATE_LIMIT_VIEWER_MAX` | Optional | viewer `GET location` ต่อ IP ต่อหน้าต่าง. Default `60` |
| `RATE_LIMIT_OWNER_MAX` | Optional | owner writes (upload/stop/progress) ต่อ IP. Default `20` |
| `RATE_LIMIT_SESSION_START_MAX` | Optional | `session/start` ต่อ IP (เข้มกว่าเพราะกันเดา owner code). Default `5` |
| `RATE_LIMIT_GOOGLE_ROUTE_MAX` | Optional | `GET /google-route` ต่อ IP. Default `10` |
| `OWNER_CODE_MAX_ATTEMPTS` | Optional | กรอก owner code ผิดกี่ครั้งต่อ IP ก่อนโดน lock. Default `10` |
| `OWNER_CODE_LOCK_MINUTES` | Optional | ล็อก IP กี่นาทีหลังเกิน max attempts. Default `15` |

### Observability (Phase 16) — optional

| Key | Required | เอามาจากไหน / ใช้ทำอะไร |
| --- | --- | --- |
| `RAILWAY_GIT_COMMIT_SHA` / `GIT_SHA` | Optional | git SHA ของ build ที่รันอยู่ — Railway inject `RAILWAY_GIT_COMMIT_SHA` ให้เอง; โผล่ที่ `/health` + `/version` เพื่อผูก instance กับ commit |

---

## เอาค่ามาจากไหน (external services)

### Supabase — `TRIP_GPS_SUPABASE_URL` + `TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY`
1. สร้าง project ฟรีที่ https://supabase.com/dashboard (cost = 0฿).
2. รัน `plans/feature-gps/sql/schema.sql` ใน project's **SQL Editor**.
3. **Project Settings → Data API → Project URL** → copy ไปใส่ `TRIP_GPS_SUPABASE_URL`
   (รูปแบบ `https://<project-ref>.supabase.co`).
4. **Project Settings → API Keys → `service_role` (secret)** → copy ไปใส่
   `TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY`. **ห้ามใช้ anon/publishable key** และห้าม
   ใส่ใน `NEXT_PUBLIC_*`.

### Cloudflare Web Analytics — `NEXT_PUBLIC_CF_BEACON_TOKEN`
1. Cloudflare Dashboard → **Analytics & Logs → Web Analytics** → add/select เว็บไซต์.
2. Cloudflare จะโชว์ snippet JS ที่มี `data-cf-beacon='{"token":"..."}'`.
3. copy token (hex ~32 ตัว) ไปใส่. **ปิด "Automatic injection"** ใน dashboard เพราะ
   แอป inject beacon เอง และตั้งใจไม่โหลดบน `/trip/NNN/live` (URL ที่มี viewer token).
   เว้นว่าง = ปิด analytics. (token นี้ public ได้ ไม่ใช่ secret)

### GitHub token — `GITHUB_TOKEN`
1. GitHub → **Settings → Developer settings → Personal access tokens**.
2. สร้าง **Fine-grained token** (หรือ classic) แบบ read-only public — feature นี้อ่าน
   แค่สถิติ public ไม่ต้องการ scope พิเศษ.
3. copy ค่าไปใส่. เป็น server-only — **ห้าม** prefix `NEXT_PUBLIC_`.

### YouTube Data API key — `YOUTUBE_API_KEY`
1. https://console.cloud.google.com → สร้าง/เลือก project.
2. **APIs & Services → Library** → enable **YouTube Data API v3**.
3. **APIs & Services → Credentials → Create credentials → API key** → copy ไปใส่.
   (แนะนำ restrict key ให้ใช้ได้เฉพาะ YouTube Data API)

### Owner code — `TRIP_GPS_OWNER_CODE`
รหัสที่คุณ (คนขับ) พิมพ์เพื่อเริ่ม/หยุดแชร์ตำแหน่ง. ตั้งเป็น plaintext ตรงๆ เช่น:

```env
TRIP_GPS_OWNER_CODE=<your-owner-code>
```

ระบบ compare แบบ constant-time. เป็น server-only — **ห้าม** prefix `NEXT_PUBLIC_`.
หมายเหตุ: ค่าใน `.env.example` ถูก commit ลง repo (ใครก็เห็นได้) — ถ้าอยากให้เดา
ยากกว่านี้ ตั้งรหัสจริงไว้ใน `.env` / host env เท่านั้น อย่า commit.

---

## Store mode (`TRIP_GPS_STORE`)

| Value | Behavior |
| --- | --- |
| `auto` | ใช้ Supabase เมื่อ production และ Supabase env ครบ; ไม่งั้น in-memory (dev) |
| `supabase` | บังคับ Supabase และ **fail fast** ถ้า env ไม่ครบ |
| `mock` | in-memory adapter สำหรับ local/test |
| `memory` | in-memory ชั่วคราว — ข้อมูลหายเมื่อ restart |

## Security notes

- `TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY` และ owner code เก็บฝั่ง server/backend
  เท่านั้น; **ห้าม** prefix ด้วย `NEXT_PUBLIC_`.
- `NEXT_PUBLIC_TRIP_GPS_UI` เป็นแค่ UI flag — API ยังตรวจ token / owner code ฝั่ง
  server เสมอ.
- `NEXT_PUBLIC_TRIP_GPS_API_BASE` เป็น public URL ได้ แต่ backend ต้องตรวจ CORS +
  token เองเสมอ.
- เปิด `TRIP_GPS_ENABLED` เฉพาะตอน token/keys พร้อม เพราะ `/trip/001` เป็น public
  (ไม่มี password).
