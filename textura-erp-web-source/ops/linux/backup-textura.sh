#!/usr/bin/env bash
set -euo pipefail

INSTALL_ROOT="${TEXTURA_INSTALL_ROOT:-/opt/textura}"
BACKUP_ROOT="${TEXTURA_BACKUP_ROOT:-$INSTALL_ROOT/backups}"
APP_DIR="${TEXTURA_APP_DIR:-$INSTALL_ROOT/current}"
MODE="${1:-predeploy}"

if [[ ! "$MODE" =~ ^(daily|weekly|predeploy)$ ]]; then
  echo "Invalid backup mode: $MODE" >&2
  exit 1
fi

ENV_FILE="${TEXTURA_BACKEND_ENV:-$INSTALL_ROOT/config/backend.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing backend env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${DB_HOST:?DB_HOST is required}"
: "${DB_PORT:?DB_PORT is required}"
: "${DB_USER:?DB_USER is required}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"
: "${DB_NAME:?DB_NAME is required}"

STAMP="$(date -u +%Y%m%d-%H%M%S)"
TARGET_DIR="$BACKUP_ROOT/$MODE"
LOG_DIR="$BACKUP_ROOT/logs"
mkdir -p "$TARGET_DIR" "$LOG_DIR"

DB_BACKUP="$TARGET_DIR/textura-db-$STAMP.dump"
META_FILE="$TARGET_DIR/textura-backup-$STAMP.json"
LOG_FILE="$LOG_DIR/backup-$MODE-$STAMP.log"

export PGPASSWORD="$DB_PASSWORD"

{
  echo "Backup started: $MODE"
  pg_dump \
    --format=custom \
    --compress=9 \
    --file="$DB_BACKUP" \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    "$DB_NAME"

  pg_restore --list "$DB_BACKUP" >/dev/null
  SHA256="$(sha256sum "$DB_BACKUP" | awk '{print $1}')"

  cat >"$META_FILE" <<JSON
{
  "mode": "$MODE",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "databaseBackup": "$DB_BACKUP",
  "databaseBackupSha256": "$SHA256",
  "appDir": "$APP_DIR",
  "host": "$(hostname)"
}
JSON

  echo "Backup completed: $DB_BACKUP"
} 2>&1 | tee "$LOG_FILE"
