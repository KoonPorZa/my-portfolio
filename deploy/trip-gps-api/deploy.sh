#!/usr/bin/env bash
#
# Local deploy for the Trip GPS API (apps/api). Run from anywhere in the repo:
#   ./deploy/trip-gps-api/deploy.sh
#
# por-dev is linux/amd64 and this machine may be arm64, so we BUILD ON por-dev:
#   1. rsync the source to por-dev (no node_modules / .git / .env*)
#   2. ship compose.yml + apps/api/.env.prod (as the container's .env)
#   3. docker build + docker compose up -d  ON por-dev (native amd64)
#   4. health-check /health
#
# Requires an SSH alias `por-dev` in ~/.ssh/config (ProxyJump via the jump host);
# override with DEPLOY_SSH_HOST=... or DEPLOY_DIR=... See DEPLOY.md section 3.
set -euo pipefail

SSH_HOST="${DEPLOY_SSH_HOST:-por-dev}"
DEPLOY_DIR="${DEPLOY_DIR:-/home/dev/Learn/my-portfolio-trip-gps-api}"
IMAGE="trip-gps-api"

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

ENV_PROD="apps/api/.env.prod"
COMPOSE="deploy/trip-gps-api/compose.yml"

# ---------- preflight ----------
[ -f "$ENV_PROD" ] || { echo "ERROR: missing $ENV_PROD. Copy apps/api/.env.example -> apps/api/.env.prod and fill production values."; exit 1; }
[ -f "$COMPOSE" ]  || { echo "ERROR: missing $COMPOSE"; exit 1; }
command -v rsync >/dev/null || { echo "ERROR: rsync not found"; exit 1; }

if grep -qiE 'REPLACE|CHANGEME|<your|example\.supabase\.co' "$ENV_PROD"; then
  echo "ERROR: $ENV_PROD still has placeholder values. Fill real values first."; exit 1
fi
# Owner code is required (empty -> the API rejects every session start).
grep -qE '^TRIP_GPS_OWNER_CODE=.+' "$ENV_PROD" || { echo "ERROR: TRIP_GPS_OWNER_CODE is empty in $ENV_PROD."; exit 1; }
# Supabase creds are required only when the supabase store is selected.
if grep -qE '^TRIP_GPS_STORE=supabase' "$ENV_PROD"; then
  grep -qE '^TRIP_GPS_SUPABASE_URL=https' "$ENV_PROD"           || { echo "ERROR: TRIP_GPS_STORE=supabase but TRIP_GPS_SUPABASE_URL is unset in $ENV_PROD."; exit 1; }
  grep -qE '^TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY=.+' "$ENV_PROD" || { echo "ERROR: TRIP_GPS_STORE=supabase but TRIP_GPS_SUPABASE_SERVICE_ROLE_KEY is unset in $ENV_PROD."; exit 1; }
fi

TAG="$(git rev-parse --short HEAD 2>/dev/null || echo latest)"
echo ">> Deploying ${IMAGE}:${TAG}  ->  ${SSH_HOST}:${DEPLOY_DIR}"

# ---------- 1. ship the build context (source only) ----------
echo ">> rsync source to ${SSH_HOST}"
ssh "$SSH_HOST" "mkdir -p '${DEPLOY_DIR}/build'"
rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.open-next' \
  --exclude '.wrangler' \
  --exclude 'dist' \
  --exclude '.env' \
  --exclude '.env.*' \
  ./ "${SSH_HOST}:${DEPLOY_DIR}/build/"

# ---------- 2. ship compose + prod env (as the container .env) ----------
echo ">> ship compose.yml + .env (from .env.prod)"
scp "$COMPOSE"  "${SSH_HOST}:${DEPLOY_DIR}/compose.yml"
scp "$ENV_PROD" "${SSH_HOST}:${DEPLOY_DIR}/.env"
ssh "$SSH_HOST" "chmod 600 '${DEPLOY_DIR}/.env'"

# ---------- 3. build + up ON the server (native amd64) ----------
echo ">> docker build + compose up on ${SSH_HOST}"
ssh "$SSH_HOST" "set -e
  cd '${DEPLOY_DIR}'
  docker build -f build/apps/api/Dockerfile -t '${IMAGE}:${TAG}' -t '${IMAGE}:latest' build/
  IMAGE_TAG='${TAG}' docker compose up -d --remove-orphans
  docker compose ps"

# ---------- 4. health check ----------
echo ">> health check (/health)"
if ssh "$SSH_HOST" "cd '${DEPLOY_DIR}'
  for i in \$(seq 1 8); do
    if docker compose exec -T trip-gps-api wget -qO- http://127.0.0.1:3000/health; then exit 0; fi
    sleep 2
  done
  exit 1"; then
  echo; echo ">> OK: ${IMAGE}:${TAG} deployed and healthy on ${SSH_HOST}."
else
  echo; echo ">> WARN: /health did not respond. Inspect: ssh ${SSH_HOST} \"cd ${DEPLOY_DIR} && docker compose logs --tail=60 trip-gps-api\""; exit 1
fi
