#!/usr/bin/env bash
set -euo pipefail

ARTIFACT_PATH=""
RELEASE_ID=""
INSTALL_ROOT="${TEXTURA_INSTALL_ROOT:-/opt/textura}"
PUBLIC_HEALTH_URL="${TEXTURA_PUBLIC_HEALTH_URL:-http://127.0.0.1:3000/health/ready}"
BLUE_PORT="${TEXTURA_BLUE_PORT:-4101}"
GREEN_PORT="${TEXTURA_GREEN_PORT:-4102}"
HEALTH_ATTEMPTS="${TEXTURA_HEALTH_ATTEMPTS:-20}"
HEALTH_DELAY_SECONDS="${TEXTURA_HEALTH_DELAY_SECONDS:-3}"
DRAIN_SECONDS="${TEXTURA_DRAIN_SECONDS:-15}"
RETAIN_RELEASES="${TEXTURA_RETAIN_RELEASES:-5}"
APP_USER="${TEXTURA_APP_USER:-textura}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root, for example: sudo $0 ..." >&2
  exit 1
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --artifact)
      ARTIFACT_PATH="$2"
      shift 2
      ;;
    --release-id)
      RELEASE_ID="$2"
      shift 2
      ;;
    --install-root)
      INSTALL_ROOT="$2"
      shift 2
      ;;
    --public-health-url)
      PUBLIC_HEALTH_URL="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

[[ -n "$ARTIFACT_PATH" ]] || { echo "--artifact is required" >&2; exit 1; }
[[ -n "$RELEASE_ID" ]] || { echo "--release-id is required" >&2; exit 1; }
[[ "$RELEASE_ID" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "Invalid release id" >&2; exit 1; }

RELEASE_ROOT="$INSTALL_ROOT/releases"
RELEASE_PATH="$RELEASE_ROOT/$RELEASE_ID"
STATE_DIR="$INSTALL_ROOT/state"
STATE_FILE="$STATE_DIR/deployment.json"
LOG_DIR="$INSTALL_ROOT/logs/deploy"
ENV_FILE="$INSTALL_ROOT/config/backend.env"
UPSTREAM_FILE="$INSTALL_ROOT/proxy/active-upstream.conf"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
LOG_FILE="$LOG_DIR/deploy-$STAMP-$RELEASE_ID.log"
RESULT_FILE="$LOG_DIR/deploy-$STAMP-$RELEASE_ID.json"

mkdir -p "$RELEASE_ROOT" "$STATE_DIR" "$LOG_DIR"

exec > >(tee -a "$LOG_FILE") 2>&1

cleanup_failed_target() {
  local slot="$1"
  systemctl stop "textura-backend@$slot" >/dev/null 2>&1 || true
  systemctl disable "textura-backend@$slot" >/dev/null 2>&1 || true
}

rollback_proxy() {
  if [[ "$PROXY_SWITCHED" != "true" || -z "${CURRENT_SLOT:-}" ]]; then
    return 0
  fi

  echo "Rolling proxy back to $CURRENT_SLOT on port $CURRENT_PORT"
  systemctl start "textura-backend@$CURRENT_SLOT" || true
  wait_for_health "http://127.0.0.1:$CURRENT_PORT/health/ready" "" "$CURRENT_SLOT" >/dev/null || true
  switch_proxy "$CURRENT_PORT" || true
  wait_for_health "$PUBLIC_HEALTH_URL" "" "$CURRENT_SLOT" >/dev/null || true
}

write_result() {
  local status="$1"
  local error="${2:-}"
  cat >"$RESULT_FILE" <<JSON
{
  "releaseId": "$RELEASE_ID",
  "status": "$status",
  "error": "$error",
  "finishedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON
}

wait_for_health() {
  local url="$1"
  local expected_release="${2:-}"
  local expected_slot="${3:-}"
  local last_error="no response"

  for attempt in $(seq 1 "$HEALTH_ATTEMPTS"); do
    if response="$(curl -fsS --max-time 10 "$url" 2>&1)"; then
      if [[ -z "$expected_release" || "$response" == *"\"release\":\"$expected_release\""* ]]; then
        if [[ -z "$expected_slot" || "$response" == *"\"slot\":\"$expected_slot\""* ]]; then
          echo "$response"
          return 0
        fi
      fi
      last_error="unexpected response: $response"
    else
      last_error="$response"
    fi

    echo "Health attempt $attempt/$HEALTH_ATTEMPTS failed for $url: $last_error"
    sleep "$HEALTH_DELAY_SECONDS"
  done

  echo "Health check failed for $url: $last_error" >&2
  return 1
}

switch_proxy() {
  local port="$1"
  local temp_file
  temp_file="$(mktemp "$INSTALL_ROOT/proxy/active-upstream.XXXXXX")"
  printf 'set $textura_upstream http://127.0.0.1:%s;\n' "$port" >"$temp_file"
  chown "$APP_USER:$APP_USER" "$temp_file" || true
  mv "$temp_file" "$UPSTREAM_FILE"
  nginx -t
  systemctl reload nginx
}

if [[ ! -f "$ARTIFACT_PATH" ]]; then
  echo "Artifact not found: $ARTIFACT_PATH" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing backend env file: $ENV_FILE" >&2
  exit 1
fi
if [[ -e "$RELEASE_PATH" ]]; then
  echo "Release already exists: $RELEASE_PATH" >&2
  exit 1
fi

CURRENT_SLOT=""
CURRENT_RELEASE=""
if [[ -f "$STATE_FILE" ]]; then
  CURRENT_SLOT="$(node -e "const fs=require('fs'); const p='$STATE_FILE'; const s=JSON.parse(fs.readFileSync(p)); console.log(s.activeSlot||'')" 2>/dev/null || true)"
  CURRENT_RELEASE="$(node -e "const fs=require('fs'); const p='$STATE_FILE'; const s=JSON.parse(fs.readFileSync(p)); console.log(s.releaseId||'')" 2>/dev/null || true)"
fi

if [[ "$CURRENT_SLOT" == "blue" ]]; then
  TARGET_SLOT="green"
  TARGET_PORT="$GREEN_PORT"
  CURRENT_PORT="$BLUE_PORT"
else
  TARGET_SLOT="blue"
  TARGET_PORT="$BLUE_PORT"
  CURRENT_PORT="$GREEN_PORT"
fi

echo "Deploying $RELEASE_ID to $TARGET_SLOT on port $TARGET_PORT"

PROXY_SWITCHED="false"
trap 'status=$?; if [[ $status -ne 0 ]]; then echo "Deployment failed"; rollback_proxy; cleanup_failed_target "$TARGET_SLOT"; write_result "failed" "see $LOG_FILE"; fi; exit $status' EXIT

mkdir -p "$RELEASE_PATH"
unzip -q "$ARTIFACT_PATH" -d "$RELEASE_PATH"
[[ -f "$RELEASE_PATH/backend/dist/server.js" ]] || { echo "Release missing backend/dist/server.js" >&2; exit 1; }

if [[ -f "$RELEASE_PATH/updates/version.json" ]]; then
  echo "Deploying update manifest..."
  mkdir -p "$INSTALL_ROOT/updates"
  cp "$RELEASE_PATH/updates/version.json" "$INSTALL_ROOT/updates/version.json"
  chown $APP_USER:$APP_USER "$INSTALL_ROOT/updates/version.json"
fi

pushd "$RELEASE_PATH/backend" >/dev/null
npm ci --omit=dev --ignore-scripts
popd >/dev/null

TEXTURA_APP_DIR="$RELEASE_PATH" TEXTURA_BACKEND_ENV="$ENV_FILE" "$SCRIPT_DIR/backup-textura.sh" predeploy
TEXTURA_BACKEND_ENV="$ENV_FILE" "$SCRIPT_DIR/run-migrations.sh" --app-dir "$RELEASE_PATH"

mkdir -p "$STATE_DIR/$TARGET_SLOT"
ln -sfn "$RELEASE_PATH/backend" "$STATE_DIR/$TARGET_SLOT/backend"
cat >"$STATE_DIR/$TARGET_SLOT/service.env" <<EOF
PORT=$TARGET_PORT
RELEASE_VERSION=$RELEASE_ID
EOF
chown -R "$APP_USER:$APP_USER" "$STATE_DIR/$TARGET_SLOT" "$RELEASE_PATH"

systemctl daemon-reload
systemctl enable "textura-backend@$TARGET_SLOT"
systemctl restart "textura-backend@$TARGET_SLOT"

wait_for_health "http://127.0.0.1:$TARGET_PORT/health/ready" "$RELEASE_ID" "$TARGET_SLOT" >/dev/null

switch_proxy "$TARGET_PORT"
PROXY_SWITCHED="true"
wait_for_health "$PUBLIC_HEALTH_URL" "$RELEASE_ID" "$TARGET_SLOT" >/dev/null

cat >"$STATE_FILE" <<JSON
{
  "activeSlot": "$TARGET_SLOT",
  "releaseId": "$RELEASE_ID",
  "previousSlot": "$CURRENT_SLOT",
  "previousReleaseId": "$CURRENT_RELEASE",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON
chown "$APP_USER:$APP_USER" "$STATE_FILE"

if [[ -n "$CURRENT_SLOT" ]]; then
  echo "Draining $CURRENT_SLOT for $DRAIN_SECONDS seconds"
  sleep "$DRAIN_SECONDS"
  systemctl stop "textura-backend@$CURRENT_SLOT" || true
  systemctl disable "textura-backend@$CURRENT_SLOT" || true
fi

find "$RELEASE_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' |
  sort -rn |
  awk -v keep="$RETAIN_RELEASES" -v current="$RELEASE_PATH" -v previous="$RELEASE_ROOT/$CURRENT_RELEASE" '
    $2 != current && $2 != previous { count++; if (count > keep) print $2 }
  ' |
  while read -r old_release; do
    case "$old_release" in
      "$RELEASE_ROOT"/*) rm -rf "$old_release" ;;
    esac
  done

write_result "succeeded"
trap - EXIT
echo "Deployment succeeded: $RELEASE_ID ($TARGET_SLOT)"
