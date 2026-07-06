#!/usr/bin/env bash
set -euo pipefail

INSTALL_ROOT="${TEXTURA_INSTALL_ROOT:-/opt/textura}"
PUBLIC_PORT="${TEXTURA_PUBLIC_PORT:-8788}"
APP_USER="${TEXTURA_APP_USER:-textura}"
INITIAL_BACKEND_PORT="${TEXTURA_INITIAL_BACKEND_PORT:-4101}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

command -v node >/dev/null || { echo "node is required" >&2; exit 1; }
command -v npm >/dev/null || { echo "npm is required" >&2; exit 1; }
command -v psql >/dev/null || { echo "psql is required" >&2; exit 1; }
command -v pg_dump >/dev/null || { echo "pg_dump is required" >&2; exit 1; }

if ! command -v nginx >/dev/null; then
  echo "nginx is required. Install with: sudo apt update && sudo apt install -y nginx" >&2
  exit 1
fi

id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"

mkdir -p \
  "$INSTALL_ROOT/config" \
  "$INSTALL_ROOT/releases" \
  "$INSTALL_ROOT/state" \
  "$INSTALL_ROOT/backups" \
  "$INSTALL_ROOT/logs/backend" \
  "$INSTALL_ROOT/logs/deploy" \
  "$INSTALL_ROOT/proxy"

chown -R "$APP_USER:$APP_USER" "$INSTALL_ROOT"

ENV_FILE="$INSTALL_ROOT/config/backend.env"
if [[ ! -f "$ENV_FILE" ]]; then
  cat >"$ENV_FILE" <<EOF
NODE_ENV=production
API_PREFIX=/api
CORS_ORIGIN=http://SERVER_LAN_IP:$PUBLIC_PORT
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=invoice_app
DB_PASSWORD=REPLACE_ME
DB_NAME=textile_invoice
DB_SSL=false
JWT_SECRET=REPLACE_WITH_AT_LEAST_64_RANDOM_CHARACTERS
JWT_EXPIRES_IN=8h
BOOTSTRAP_ADMIN_ENABLED=false
EOF
  chmod 640 "$ENV_FILE"
  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  echo "Created $ENV_FILE. Replace placeholder values before first deployment."
fi

cat >/etc/systemd/system/textura-backend@.service <<EOF
[Unit]
Description=Textura Backend %i slot
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$INSTALL_ROOT/state/%i/backend
EnvironmentFile=$ENV_FILE
Environment=NODE_ENV=production
Environment=DEPLOYMENT_SLOT=%i
EnvironmentFile=-$INSTALL_ROOT/state/%i/service.env
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=$INSTALL_ROOT
StandardOutput=append:$INSTALL_ROOT/logs/backend/%i-stdout.log
StandardError=append:$INSTALL_ROOT/logs/backend/%i-stderr.log

[Install]
WantedBy=multi-user.target
EOF

cat >"$INSTALL_ROOT/proxy/active-upstream.conf" <<EOF
set \$textura_upstream http://127.0.0.1:$INITIAL_BACKEND_PORT;
EOF
chown "$APP_USER:$APP_USER" "$INSTALL_ROOT/proxy/active-upstream.conf"

cat >/etc/nginx/sites-available/textura.conf <<EOF
server {
    listen $PUBLIC_PORT;
    server_name _;

    access_log $INSTALL_ROOT/logs/nginx-access.log;
    error_log $INSTALL_ROOT/logs/nginx-error.log;

    include $INSTALL_ROOT/proxy/active-upstream.conf;

    location / {
        proxy_pass \$textura_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 5s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

ln -sfn /etc/nginx/sites-available/textura.conf /etc/nginx/sites-enabled/textura.conf
nginx -t
systemctl daemon-reload
systemctl enable nginx
systemctl restart nginx

echo "Linux blue-green layout installed at $INSTALL_ROOT"
echo "Public endpoint: http://SERVER_LAN_IP:$PUBLIC_PORT"
echo "Edit $ENV_FILE before first deployment."

