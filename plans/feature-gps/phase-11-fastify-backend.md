# Phase 11 — Fastify backend service

**Priority:** P1 · **Branch:** `feat/gps` · **Depends on:** Phase 3
**Read first:** `phase-00-overview.md` (guardrails, data contract, tables) and
`docs/env-doc.md` (environment variables)

## Goal

Create a dedicated Fastify + TypeScript backend for Trip GPS. This service
replaces the Next.js Route Handler implementation for the GPS API and owns the
server-only boundary for Supabase, owner/viewer token checks, rate limiting,
and API responses.

Keep the Next app as the frontend. The web app calls the Fastify backend
through `NEXT_PUBLIC_TRIP_GPS_API_BASE`, such as
`https://api.koonporza.com`.

## Architecture

Place the backend in `apps/api` so the frontend and backend can be versioned in
one repository while staying deployable as separate services.

```text
apps/
  web/                       # optional future move for the Next frontend
  api/
    src/
      app.ts                 # create and configure the Fastify app
      server.ts              # listen, graceful shutdown
      config/
        env.ts               # validate and export server env
      plugins/
        cors.ts
        security.ts
        rate-limit.ts
        supabase.ts
        request-id.ts
      modules/
        health/
          health.routes.ts
        trip-gps/
          trip-gps.routes.ts
          trip-gps.service.ts
          trip-gps.repo.ts
          trip-gps.schema.ts
          trip-gps.types.ts
          trip-gps.tokens.ts
      lib/
        crypto.ts
        errors.ts
        logger.ts
        time.ts
      tests/
        trip-gps.test.ts
    package.json
    tsconfig.json
    Dockerfile
```

If moving the existing Next app into `apps/web` is too large for this phase,
leave it at the repository root and create only `apps/api`. Do not mix Fastify
dependencies into the web app unless the repository is explicitly converted
into a workspace.

## Dependencies

Add dependencies only inside the backend package unless a monorepo workspace is
created first.

- `fastify`
- `@fastify/cors`
- `@fastify/helmet`
- `@fastify/rate-limit`
- `@fastify/sensible`
- `@sinclair/typebox`
- `@supabase/supabase-js`
- `tsx`
- `vitest`

Prefer TypeBox for request and response schemas because Fastify validates JSON
Schema through Ajv.

## Routes

Expose a small REST API. Keep response shapes compatible with the shared data
contract in the overview.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Backend health check for deploy platform probes |
| `POST` | `/api/trips/:tripId/location` | Owner GPS upload with `Authorization: Bearer <owner-token>` |
| `GET` | `/api/trips/:tripId/location` | Viewer latest read with `?t=<viewer-token>` |
| `POST` | `/api/trips/:tripId/session/start` | Create or restart an owner sharing session |
| `POST` | `/api/trips/:tripId/session/stop` | Stop the active sharing session |

Use `tripId = "001"` for the MVP. Structure the route with `:tripId` anyway so
the service doesn't hard-code the trip in every module.

## Layer responsibilities

Keep boundaries small and explicit.

- `routes` parse the HTTP request, apply schemas, and return responses.
- `service` owns business rules, freshness state, rate-limit decisions, and
  token checks.
- `repo` owns Supabase reads and writes.
- `schema` owns TypeBox request and response contracts.
- `tokens` owns token generation, SHA-256 hashing, and constant-time compare.

## Environment variables

The backend owns server secrets.

```env
NODE_ENV=production
PORT=3000
CORS_ORIGINS=https://koonporza.com,https://www.koonporza.com
TRIP_GPS_ENABLED=1
TRIP_GPS_STORE=supabase
TRIP_GPS_SUPABASE_URL=
TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY=
TRIP_GPS_OWNER_CODE=
```

The frontend only needs public flags and the backend base URL.

```env
NEXT_PUBLIC_TRIP_GPS_UI=1
NEXT_PUBLIC_TRIP_GPS_API_BASE=https://api.koonporza.com
```

Never expose `TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY` or `TRIP_GPS_OWNER_CODE` to
the browser.

## Storage

Use Supabase Postgres as the production store and keep a mock or in-memory
adapter for local development.

Required tables stay the same as the overview:

- `trip_share_sessions`
- `trip_location_latest`
- `trip_location_points`

The repository layer must upsert `trip_location_latest` and append
`trip_location_points` in the owner upload path. It must read
`trip_location_latest` in the viewer latest path.

## Deployment

Deploy the backend separately from the frontend.

- Frontend: **Cloudflare Workers** (via `@opennextjs/cloudflare`) — see `DEPLOY.md`.
- Backend: Railway first, Render if a more predictable always-on service is
  preferred, or Fly.io if Docker and regional control are worth the extra ops.
- Database: Supabase Postgres.
- Domain: point `api.koonporza.com` to the backend service.

Do not add a paid backend plan without asking first. If a free tier sleeps or
causes unacceptable cold starts, document the impact and ask before upgrading.

## Tasks

1. Create the `apps/api` backend package with TypeScript, Fastify, and a
   focused package script set: `dev`, `build`, `start`, `lint`, and `test`.
2. Implement `src/app.ts` and `src/server.ts` with graceful shutdown and
   structured logging.
3. Implement env validation in `src/config/env.ts`. Fail fast in production
   when `TRIP_GPS_STORE=supabase` and Supabase env is missing.
4. Register CORS, Helmet, rate limiting, request IDs, and Supabase plugins.
5. Implement the Trip GPS route, service, repository, schema, and token files.
6. Preserve the shared data contract from `phase-00-overview.md`.
7. Update the frontend GPS client to call `NEXT_PUBLIC_TRIP_GPS_API_BASE`
   instead of relative Next API routes.
8. Add focused tests for token hashing, payload validation, freshness state,
   invalid token behavior, and too-frequent upload rejection.
9. Add deployment notes for Railway, Render, or Fly.io after the host is chosen.

## Acceptance criteria

- [ ] `GET /health` returns a stable JSON response.
- [ ] `POST /api/trips/001/location` accepts a valid owner token and stores the
      latest point plus history through the selected store.
- [ ] `GET /api/trips/001/location?t=<viewer-token>` returns the viewer latest
      contract with `viewerState` and `nextPollMs`.
- [ ] Invalid or missing token returns `401` or `403`; malformed payload
      returns `400`; too-frequent upload returns `429`.
- [ ] Supabase service-role key is only read by the backend package.
- [ ] Frontend code reads `NEXT_PUBLIC_TRIP_GPS_API_BASE` and doesn't import
      backend-only modules.
- [ ] Backend `lint`, `build`, and `test` pass.
- [ ] Web app `npm run lint` and `npm run build` pass after the API base URL
      change.

## Out of scope

- Realtime subscriptions.
- WebSocket transport.
- Native app tracker.
- Moving the whole repository into a full monorepo unless it is required for
  the backend package.
