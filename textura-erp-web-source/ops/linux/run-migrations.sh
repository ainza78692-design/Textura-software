#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${TEXTURA_APP_DIR:-${1:-/opt/textura/current}}"
ENV_FILE="${TEXTURA_BACKEND_ENV:-/opt/textura/config/backend.env}"
BASELINE_EXISTING_SCHEMA="${BASELINE_EXISTING_SCHEMA:-false}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-dir)
      APP_DIR="$2"
      shift 2
      ;;
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --baseline-existing-schema)
      BASELINE_EXISTING_SCHEMA="true"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

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

MIGRATION_DIR="$APP_DIR/database/migrations"
if [[ ! -d "$MIGRATION_DIR" ]]; then
  echo "Migration directory not found: $MIGRATION_DIR" >&2
  exit 1
fi

export PGPASSWORD="$DB_PASSWORD"
PSQL=(psql --host "$DB_HOST" --port "$DB_PORT" --username "$DB_USER" --dbname "$DB_NAME" -v ON_ERROR_STOP=1)

"${PSQL[@]}" -c "create table if not exists schema_migrations (filename text primary key, applied_at timestamptz not null default now());"

EXISTING_SCHEMA="$("${PSQL[@]}" -t -A -c "select to_regclass('public.app_users') is not null;" | tr -d '[:space:]')"
MIGRATION_COUNT="$("${PSQL[@]}" -t -A -c "select count(*) from schema_migrations;" | tr -d '[:space:]')"

if [[ "$EXISTING_SCHEMA" == "t" && "$MIGRATION_COUNT" == "0" ]]; then
  if [[ "$BASELINE_EXISTING_SCHEMA" != "true" ]]; then
    echo "Existing schema has no migration history. Run once with --baseline-existing-schema after verifying current schema." >&2
    exit 1
  fi

  echo "Existing Textura schema detected. Baselining current migration files."
  while IFS= read -r -d '' file; do
    name="$(basename "$file" | sed "s/'/''/g")"
    "${PSQL[@]}" -c "insert into schema_migrations(filename) values ('$name') on conflict do nothing;"
  done < <(find "$MIGRATION_DIR" -maxdepth 1 -name '*.sql' -print0 | sort -z)
  exit 0
fi

while IFS= read -r -d '' file; do
  name="$(basename "$file")"
  escaped_name="$(printf "%s" "$name" | sed "s/'/''/g")"
  already="$("${PSQL[@]}" -t -A -c "select 1 from schema_migrations where filename = '$escaped_name';" | tr -d '[:space:]')"
  if [[ "$already" == "1" ]]; then
    echo "Skipping migration $name"
    continue
  fi

  echo "Applying migration $name"
  "${PSQL[@]}" -f "$file"
  "${PSQL[@]}" -c "insert into schema_migrations(filename) values ('$escaped_name');"
done < <(find "$MIGRATION_DIR" -maxdepth 1 -name '*.sql' -print0 | sort -z)
