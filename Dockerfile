# Self-host image for apps/web (plain Node server). The Workers build
# (opennextjs-cloudflare) is unrelated and keeps using `npm run deploy`.
FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci --workspace web --include-workspace-root

FROM node:22-alpine AS build
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1 SELF_HOST_BUILD=1
COPY --from=deps /repo/node_modules node_modules
COPY package.json package-lock.json ./
COPY apps/web apps/web
RUN npm run build --workspace web

FROM node:22-alpine AS run
WORKDIR /repo
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static apps/web/.next/static
COPY --from=build /repo/apps/web/public apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
