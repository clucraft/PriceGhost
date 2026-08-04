#!/usr/bin/env bash
# Dump the geist Postgres database to a gzip file with rotation.
# Keeps the last 7 daily backups and the last 4 weekly (Sunday) backups.
# Runs on the VPS; invoked by cron (daily) and by deploy.sh (pre-deploy safety dump).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

COMPOSE="docker compose -f docker-compose.prod.yml"

# Load POSTGRES_USER / POSTGRES_DB from .env.
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

BACKUP_DIR="$REPO_DIR/backups"
DAILY_DIR="$BACKUP_DIR/daily"
WEEKLY_DIR="$BACKUP_DIR/weekly"
mkdir -p "$DAILY_DIR" "$WEEKLY_DIR"

STAMP="$(date +%Y-%m-%d_%H%M%S)"
OUT="$DAILY_DIR/geist-${STAMP}.sql.gz"

echo "[backup] Dumping database '${POSTGRES_DB}' -> $OUT"
$COMPOSE exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$OUT"

# On Sundays, also keep a weekly copy.
if [[ "$(date +%u)" == "7" ]]; then
  cp "$OUT" "$WEEKLY_DIR/"
fi

# Rotation: keep newest 7 daily, newest 4 weekly.
ls -1t "$DAILY_DIR"/geist-*.sql.gz  2>/dev/null | tail -n +8 | xargs -r rm -f
ls -1t "$WEEKLY_DIR"/geist-*.sql.gz 2>/dev/null | tail -n +5 | xargs -r rm -f

echo "[backup] Done. Current backups:"
ls -1 "$DAILY_DIR" "$WEEKLY_DIR"
