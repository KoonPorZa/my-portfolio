# Trip GPS environment variables

ไฟล์นี้สรุป environment variables ที่ใช้กับ Trip GPS live-location
feature. ค่า secret ต้องตั้งเฉพาะฝั่ง server เท่านั้น และห้ามใส่ไว้ใน
`NEXT_PUBLIC_*` เว้นแต่ตัวแปรนั้นเป็น public UI flag โดยตรง

Frontend variables start from `apps/web/.env.example`; backend variables start
from `apps/api/.env.example`.

## Required server variables

ตัวแปรกลุ่มนี้ใช้เปิด storage จริงและยืนยันสิทธิ์ owner บนฝั่ง server.
ตั้งค่าใน backend hosting provider เช่น Railway, Render, Fly.io, หรือ
Vercel project environment variables ถ้ายังใช้ Next Route Handler track.

| Key | ได้มาจากไหน |
| --- | --- |
| `TRIP_GPS_ENABLED` | สวิตช์หลัก ต้องเป็น `1` และต้องมี `TRIP_GPS_SUPABASE_URL` กับ `TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY` ไม่ว่าง gate ถึงจะผ่าน |
| `TRIP_GPS_SUPABASE_URL` | Supabase Dashboard -> **Project Settings** -> **Data API** -> **Project URL** เช่น `https://<ref>.supabase.co` |
| `TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard -> **Project Settings** -> **API Keys** -> คีย์ `service_role` แบบ secret. ห้ามใช้ `anon` หรือ `publishable` key และห้ามตั้งเป็น `NEXT_PUBLIC_*` |
| `TRIP_GPS_OWNER_CODE` | รหัสที่คุณตั้งเองสำหรับ owner. สุ่มได้ด้วย `openssl rand -base64 24` |
| `TRIP_GPS_OWNER_CODE_HASH` หรือ `TRIP_GPS_OWNER_CODE_SHA256` | ค่า hex SHA-256 ของ owner code. ใช้ค่านี้ก่อน plaintext ถ้ามีทั้งสองค่า |
| `TRIP_GPS_STORE` | เลือก storage backend: `auto`, `supabase`, `mock`, หรือ `memory` |
| `CORS_ORIGINS` | รายชื่อ origin ที่ Fastify backend อนุญาต คั่นด้วย comma เช่น `https://koonporza.com,https://www.koonporza.com` |

## Public browser variables

ตัวแปรกลุ่มนี้ส่งถึง browser ได้ ห้ามใช้เป็น authentication หรือ security
boundary.

| Key | ได้มาจากไหน |
| --- | --- |
| `NEXT_PUBLIC_TRIP_GPS_UI` | flag สำหรับโชว์หรือซ่อน UI เท่านั้น ไม่ใช่ auth |
| `NEXT_PUBLIC_TRIP_GPS_API_BASE` | base URL ของ Fastify backend เช่น `https://api.koonporza.com`. ใช้ให้ frontend เรียก API แยกจาก Next app |
| `NEXT_PUBLIC_CF_BEACON_TOKEN` | Cloudflare -> **Web Analytics** -> token ใน snippet `data-cf-beacon`. ปิด Automatic injection ไว้ถ้าแอป inject beacon เอง |

## Generate owner code and hash

ใช้คำสั่งนี้เพื่อสร้าง owner code:

```bash
openssl rand -base64 24
```

ใช้คำสั่งนี้เพื่อสร้าง SHA-256 hash จาก owner code:

```bash
printf %s 'รหัส' | shasum -a 256 | awk '{print $1}'
```

แนะนำให้ตั้งค่า hash เป็นหลัก:

```env
TRIP_GPS_OWNER_CODE_HASH=<hex-sha256>
```

ใช้ `TRIP_GPS_OWNER_CODE` เฉพาะ local development หรือช่วง bootstrap
เท่านั้น ถ้ามีทั้ง plaintext และ hash ให้ระบบเลือก hash ก่อน.

## Store mode

`TRIP_GPS_STORE` ใช้ควบคุม storage backend ที่ Fastify service หรือ
server-side API เลือกใช้.

| Value | Behavior |
| --- | --- |
| `auto` | ใช้ Supabase เมื่อ env ครบและ `TRIP_GPS_ENABLED=1`; fallback ตาม implementation สำหรับ local/dev |
| `supabase` | บังคับใช้ Supabase และควร fail ถ้า Supabase env ไม่ครบ |
| `mock` | ใช้ mock adapter สำหรับ local development หรือ test |
| `memory` | ใช้ in-memory store ชั่วคราว ข้อมูลหายเมื่อ process restart |

## Security notes

- เก็บ `TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY`, `TRIP_GPS_OWNER_CODE`, และ
  owner code hash ไว้เฉพาะฝั่ง server.
- ห้าม prefix secret ด้วย `NEXT_PUBLIC_`.
- `NEXT_PUBLIC_TRIP_GPS_UI` เป็นแค่ UI flag. API ยังต้องตรวจ server-side
  token หรือ owner code เสมอ.
- `NEXT_PUBLIC_TRIP_GPS_API_BASE` เป็น public URL ได้ แต่ backend ต้องตรวจ
  CORS และ token เองเสมอ.
- Cloudflare Web Analytics token ไม่ใช่ secret แต่ต้องปิด automatic
  injection ถ้าแอปจัดการ beacon เอง.
