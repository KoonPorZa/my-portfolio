# syntax=docker/dockerfile:1
#
# Fastify Trip GPS API image. BUILD FROM THE REPO ROOT:
#   docker build -f apps/api/Dockerfile -t trip-gps-api .
# apps/api is part of an npm-workspaces monorepo whose lockfile is the ROOT
# package-lock.json, so the build context must be the repo root (not apps/api).

# ---- build: install the workspace against the root lockfile, compile the API --
FROM node:22-alpine AS build
WORKDIR /app
# All workspace manifests must be present so `npm ci` can reconcile the root
# lockfile (npm validates every workspace package.json against it).
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json
RUN npm ci
# Compile only the API workspace (tsc -> apps/api/dist).
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY apps/api/src ./apps/api/src
RUN npm run build:api

# ---- prod-deps: lean, API-only production dependencies -----------------------
# Resolved from apps/api/package.json ALONE (not the root lockfile) on purpose,
# so the runtime image carries only the API's deps and never drags in the web
# app's next/react. Trade-off: caret-range resolution instead of lockfile pinning
# — do not "fix" this into a root `npm ci --omit=dev` (that re-adds next/react).
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY apps/api/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

# ---- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Default listen port. Keep in sync with EXPOSE, compose `expose`, and the
# healthcheck. A server-local .env that sets PORT would override this — it must
# stay 3000 (or be omitted) for Nginx Proxy Manager -> trip-gps-api:3000 to work.
ENV PORT=3000
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY apps/api/package.json ./package.json
EXPOSE 3000
USER node
CMD ["node", "dist/server.js"]
