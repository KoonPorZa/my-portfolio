# Environment variables

ไฟล์นี้สรุป environment variables ที่ต้องตั้งสำหรับ portfolio repo นี้ โดยแยก
ตาม service ที่ใช้งานจริงตอน deploy: `apps/web` เป็น Next.js frontend และ
`apps/api` เป็น Fastify backend. ค่า secret ต้องอยู่เฉพาะฝั่ง server หรือ
backend host เท่านั้น ห้ามใส่ secret ใน `NEXT_PUBLIC_*`.

เริ่มจากไฟล์ template เหล่านี้:

- Frontend: `apps/web/.env.example`
- Backend: `apps/api/.env.example`

## Production frontend

ตั้งค่ากลุ่มนี้ใน **Cloudflare Workers** ที่ deploy `apps/web`
(Workers Builds → Build variables สำหรับค่า build-time, หรือ `wrangler secret put` สำหรับ runtime secrets).

> **หมายเหตุ:** ตัวแปร `NEXT_PUBLIC_*` ต้องตั้งตอน **build time** เพราะ Next.js
> inline ค่าเหล่านี้เข้า client bundle ตอน build — ตั้งใน Workers Builds → Build variables
> ไม่ใช่ตั้งเป็น runtime secret.

| Key | Required | Value | ได้มาจากไหน / ใช้ทำอะไร |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_TRIP_GPS_API_BASE` | Yes, when using Fastify backend | `https://api.koonporza.com` | public base URL ของ Fastify backend. เว้นว่างเฉพาะตอนใช้ same-origin Next fallback route |
| `NEXT_PUBLIC_TRIP_GPS_UI` | Optional | `0` หรือ `1` | เปิด/ปิด UI ของ Trip GPS ใน browser. เป็นแค่ UI flag ไม่ใช่ auth |
| `NEXT_PUBLIC_CF_BEACON_TOKEN` | Optional | Cloudflare token | Cloudflare -> **Web Analytics** -> token ใน snippet `data-cf-beacon`. ปิด Automatic injection ถ้าแอป inject beacon เอง |
| `GITHUB_TOKEN` | Optional | GitHub fine-grained หรือ classic token | เพิ่ม rate limit ตอน frontend server fetch GitHub social stats. ไม่ใช่ `NEXT_PUBLIC_*` |
| `YOUTUBE_API_KEY` | Optional | Google Cloud YouTube Data API key | ใช้ดึง YouTube channel stats. ถ้าไม่ตั้ง tile จะ fallback เป็น static link |

## Production backend

ตั้งค่ากลุ่มนี้ใน backend host ที่ deploy `apps/api`, เช่น Railway, Render,
หรือ Fly.io. ตัวแปรกลุ่มนี้ห้ามอยู่ใน browser bundle.

| Key | Required | Value | ได้มาจากไหน / ใช้ทำอะไร |
| --- | --- | --- | --- |
| `NODE_ENV` | Recommended | `production` | บอก runtime mode ของ Fastify backend |
| `PORT` | Usually host-provided | host-provided port | backend host มัก inject ให้เอง. local default คือ `3000` |
| `CORS_ORIGINS` | Yes | `https://koonporza.com,https://www.koonporza.com` | origin ที่ frontend เรียก API ได้. เพิ่ม preview/local origin ได้ตามต้องการ |
| `TRIP_GPS_ENABLED` | Yes | `1` | master switch สำหรับ Trip GPS server behavior |
| `TRIP_GPS_STORE` | Yes | `supabase` หรือ `auto` | production แนะนำ `supabase` เพื่อ fail fast ถ้า env DB ไม่ครบ |
| `TRIP_GPS_SUPABASE_URL` | Yes for Supabase | `https://<ref>.supabase.co` | Supabase Dashboard -> **Project Settings** -> **Data API** -> Project URL |
| `TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY` | Yes for Supabase | service-role secret | Supabase Dashboard -> **Project Settings** -> **API Keys** -> `service_role`. ห้ามใช้ anon/publishable key |
| `TRIP_GPS_OWNER_CODE_HASH` | Recommended | hex SHA-256 | hash ของรหัส owner สำหรับเริ่ม/หยุด session. ใช้ค่านี้แทน plaintext ใน production |
| `TRIP_GPS_OWNER_CODE_SHA256` | Optional alias | hex SHA-256 | alias ของ `TRIP_GPS_OWNER_CODE_HASH`. ตั้งอย่างใดอย่างหนึ่งพอ |
| `TRIP_GPS_OWNER_CODE` | Local only | plaintext owner code | ใช้ง่ายใน local dev. Production แนะนำใช้ hash แทน |

## Local frontend

สร้างไฟล์ `apps/web/.env.local` จาก `apps/web/.env.example`.

| Scenario | Key values |
| --- | --- |
| ใช้ Fastify local backend | `NEXT_PUBLIC_TRIP_GPS_API_BASE=http://localhost:3000` และ `NEXT_PUBLIC_TRIP_GPS_UI=1` |
| ใช้ Next fallback route | `NEXT_PUBLIC_TRIP_GPS_API_BASE=` แล้วตั้ง server-only fallback vars ในไฟล์เดียวกัน |
| ปิด GPS UI | `NEXT_PUBLIC_TRIP_GPS_UI=0` |
| เปิด Cloudflare analytics local | ปกติไม่ต้องตั้ง `NEXT_PUBLIC_CF_BEACON_TOKEN` ใน local |

## Local backend

สร้างไฟล์ `apps/api/.env` จาก `apps/api/.env.example`.

| Scenario | Key values |
| --- | --- |
| local memory store | `NODE_ENV=development`, `TRIP_GPS_STORE=memory`, `TRIP_GPS_ENABLED=1`, และตั้ง `TRIP_GPS_OWNER_CODE` หรือ `TRIP_GPS_OWNER_CODE_HASH` |
| local Supabase store | `TRIP_GPS_STORE=supabase`, `TRIP_GPS_SUPABASE_URL=<real-url>`, `TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY=<real-service-role-key>` |
| local CORS | `CORS_ORIGINS=http://localhost:3000` |

## Next fallback server variables

ตัวแปรกลุ่มนี้อยู่ใน `apps/web/.env.local` เฉพาะเมื่อ
`NEXT_PUBLIC_TRIP_GPS_API_BASE` ว่างและต้องใช้ same-origin Next fallback API
routes ที่ `apps/web/app/api/trips/001/*`.

| Key | Required | Value | ใช้ทำอะไร |
| --- | --- | --- | --- |
| `TRIP_GPS_ENABLED` | Yes | `1` | เปิด fallback GPS API |
| `TRIP_GPS_SUPABASE_URL` | Yes for Supabase | Supabase URL | ใช้กับ fallback Supabase store |
| `TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY` | Yes for Supabase | service-role secret | ใช้กับ fallback Supabase store. ห้าม expose |
| `TRIP_GPS_OWNER_CODE_HASH` / `TRIP_GPS_OWNER_CODE_SHA256` | Recommended | hex SHA-256 | auth owner code ใน fallback session route |
| `TRIP_GPS_OWNER_CODE` | Local only | plaintext owner code | ใช้แทน hash ได้ใน local |
| `TRIP_GPS_STORE` | Optional | `auto`, `supabase`, `mock`, หรือ `memory` | เลือก fallback store |

## Generate owner code and hash

ใช้คำสั่งนี้เพื่อสร้าง owner code:

```bash
openssl rand -base64 24
```

ใช้คำสั่งนี้เพื่อสร้าง SHA-256 hash จาก owner code:

```bash
printf %s 'รหัส' | shasum -a 256 | awk '{print $1}'
```

ตั้งค่า hash เป็นหลักใน production:

```env
TRIP_GPS_OWNER_CODE_HASH=<hex-sha256>
```

ถ้ามีทั้ง plaintext และ hash ให้ระบบเลือก hash ก่อน.

## Store mode

`TRIP_GPS_STORE` ใช้ควบคุม storage backend ที่ Fastify service หรือ fallback
server-side API เลือกใช้.

| Value | Behavior |
| --- | --- |
| `auto` | ใช้ Supabase เมื่อ production และ Supabase env ครบ; fallback เป็น memory สำหรับ dev |
| `supabase` | บังคับใช้ Supabase และ fail fast ถ้า Supabase env ไม่ครบ |
| `mock` | ใช้ in-memory adapter สำหรับ local development หรือ test |
| `memory` | ใช้ in-memory store ชั่วคราว ข้อมูลหายเมื่อ process restart |

## Security notes

- เก็บ `TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY`, `TRIP_GPS_OWNER_CODE`, และ owner
  code hash ไว้เฉพาะฝั่ง server หรือ backend host.
- ห้าม prefix secret ด้วย `NEXT_PUBLIC_`.
- `NEXT_PUBLIC_TRIP_GPS_UI` เป็นแค่ UI flag. API ยังต้องตรวจ server-side
  token หรือ owner code เสมอ.
- `NEXT_PUBLIC_TRIP_GPS_API_BASE` เป็น public URL ได้ แต่ backend ต้องตรวจ
  CORS และ token เองเสมอ.
- Cloudflare Web Analytics token ไม่ใช่ secret แต่ต้องปิด automatic injection
  ถ้าแอปจัดการ beacon เอง.
