#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# Configuration & Defaults
export CI="${CI:-true}"
export CUBRID_CMS_PORT="${CUBRID_CMS_PORT:-28001}"
export CUBRID_BROKER_PORT="${CUBRID_BROKER_PORT:-38000}"
export CUBRID_IMAGE="${CUBRID_IMAGE:-cubrid/cubrid:11.4}"
export CUBRID_CONTAINER_NAME="${CUBRID_CONTAINER_NAME:-cubrid-e2e-ephemeral}"

# TCP Test Suite Environment (Targeting local Ephemeral Docker CMS)
export CMS_HOST="127.0.0.1"
export CMS_PORT="${CUBRID_CMS_PORT}"
export CMS_USER="${CMS_USER:-admin}"
export CMS_PASSWORD="${CMS_PASSWORD:-admin}"
export E2E_DB="${E2E_DB:-demodb}"
export WEBMANAGER_REPO_PATH="$REPO_ROOT"
export WEBMANAGER_SKIP_BUILD="true"

echo "======================================================="
echo "   TCP E2E Suite: Ephemeral Dockerized CUBRID CMS      "
echo "======================================================="
echo "CMS Host:      $CMS_HOST"
echo "CMS Port:      $CMS_PORT"
echo "CUBRID Image:  $CUBRID_IMAGE"
echo "CWM Path:      $WEBMANAGER_REPO_PATH"
echo "======================================================="

cleanup() {
  echo ""
  echo "🛑 [Teardown] Destroying ephemeral CUBRID container..."
  docker compose -f docker-compose.e2e.yml down -v --remove-orphans 2>/dev/null || true
  echo "✅ Teardown complete."
}

trap cleanup EXIT INT TERM

# 1. Start Ephemeral CUBRID CMS Container
echo "🚀 [Step 1/3] Starting CUBRID CMS container..."
docker compose -f docker-compose.e2e.yml up -d

# 2. Wait for CMS to become healthy
echo "⏳ [Step 2/3] Waiting for CUBRID CMS to become ready on port $CUBRID_CMS_PORT..."
MAX_ATTEMPTS=60
READY=false
for i in $(seq 1 $MAX_ATTEMPTS); do
  STATUS="$(docker inspect --format '{{json .State.Health.Status}}' "$CUBRID_CONTAINER_NAME" 2>/dev/null || echo '"starting"')"
  if [ "$STATUS" = '"healthy"' ]; then
    READY=true
    break
  fi
  sleep 2
done

if [ "$READY" != "true" ]; then
  echo "❌ Error: CUBRID CMS container failed to become healthy within $((MAX_ATTEMPTS * 2))s."
  docker logs "$CUBRID_CONTAINER_NAME" --tail 100 || true
  exit 1
fi
echo "✅ CUBRID CMS container is healthy!"

# 3. Execute TCP (cubrid-webmanager-e2e) Test Suite
echo "🧪 [Step 3/3] Executing TCP test suite in ./tcp..."
if [ ! -d "$REPO_ROOT/tcp" ]; then
  echo "❌ Error: Directory '$REPO_ROOT/tcp' not found. Make sure CUBRID/cubrid-webmanager-e2e is checked out into ./tcp."
  exit 1
fi

cd "$REPO_ROOT/tcp"
npm test

echo "🎉 TCP test suite finished successfully!"
