#!/usr/bin/env bash
# Deploy the geist stack on the VPS. Invoked over SSH by the GitHub Actions deploy job.
# The deployed image tag is passed in via the IMAGE_TAG environment variable
# (the short commit SHA). Falls back to the .env value if unset.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

COMPOSE="docker compose -f docker-compose.prod.yml"

echo "[deploy] Updating repository (compose file, Caddyfile, scripts)..."
git pull --ff-only

# Persist the requested image tag into .env so manual restarts reuse the same commit.
if [[ -n "${IMAGE_TAG:-}" ]]; then
  echo "[deploy] Deploying IMAGE_TAG=$IMAGE_TAG"
  if grep -q '^IMAGE_TAG=' .env 2>/dev/null; then
    sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${IMAGE_TAG}/" .env
  else
    echo "IMAGE_TAG=${IMAGE_TAG}" >> .env
  fi
fi

# Pre-deploy safety backup (non-fatal on first deploy when the DB isn't up yet).
echo "[deploy] Running pre-deploy backup..."
bash "$REPO_DIR/scripts/backup.sh" || echo "[deploy] WARNING: backup skipped/failed (ok on first deploy)"

echo "[deploy] Pulling new images..."
$COMPOSE pull

echo "[deploy] Starting/updating containers..."
# Only services whose image tag changed are recreated; postgres is left running,
# so the postgres_data volume and its data persist across deploys.
$COMPOSE up -d

echo "[deploy] Pruning dangling images..."
docker image prune -f

echo "[deploy] Current state:"
$COMPOSE ps
