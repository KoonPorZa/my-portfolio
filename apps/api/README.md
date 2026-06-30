# Trip GPS API

This package is the dedicated Fastify backend for Trip GPS live location. It
owns owner-code checks, owner and viewer token validation, rate limiting,
Supabase service-role access, and the GPS API response contract.

## Run locally

Install dependencies only from this package when they are missing. In this
repository, `node_modules` is already present.

1. Copy `apps/api/.env.example` to `apps/api/.env`.
2. Set `TRIP_GPS_STORE=memory` for local development without Supabase.
3. Set `TRIP_GPS_OWNER_CODE_HASH` to the SHA-256 hash of your owner code.
4. Run the backend:

```bash
npm run dev
```

The server listens on `PORT`, defaulting to `3000`.

## Environment variables

The API reads only server-side variables. Do not use `NEXT_PUBLIC_` for secrets.

- `NODE_ENV`: Runtime mode. Use `production` on hosted backends.
- `PORT`: Listen port. Most hosts provide this automatically.
- `CORS_ORIGINS`: Comma-separated frontend origins that may call the API.
- `TRIP_GPS_ENABLED`: Set to `1` to enable Trip GPS server behavior.
- `TRIP_GPS_STORE`: Use `auto`, `supabase`, `mock`, or `memory`.
- `TRIP_GPS_SUPABASE_URL`: Supabase Project URL from **Data API** settings.
- `TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY`: Supabase `service_role` secret key.
- `TRIP_GPS_OWNER_CODE_HASH`: Hex SHA-256 of the owner code.

For local memory mode, Supabase variables can stay empty. When
`TRIP_GPS_STORE=supabase`, the API fails fast unless the Supabase URL and
service-role key are real values.

## Deploy notes

Deploy this package as a separate backend service from the Next.js frontend.
Set the frontend `NEXT_PUBLIC_TRIP_GPS_API_BASE` to the public backend origin,
for example `https://api.koonporza.com`.

Railway, Render, and Fly.io can all run this service. Use the Dockerfile when
the host supports Docker, or run `npm run build` followed by `npm start` when
the host builds Node packages directly.

Free tiers may sleep or cold-start. Do not add a paid plan without asking first.
If cold starts become a real trip risk, document the impact and decide on the
hosting plan before upgrading.
