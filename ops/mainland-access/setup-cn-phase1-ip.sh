#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <worker-host>"
  echo "Example: $0 tradelovin.mark-377.workers.dev"
  exit 1
fi

WORKER_HOST="$1"

if [[ "$WORKER_HOST" == http* ]]; then
  echo "Please pass worker host only, without protocol."
  echo "Expected: tradelovin.mark-377.workers.dev"
  exit 1
fi

if ! command -v apt >/dev/null 2>&1; then
  echo "This script currently supports Debian/Ubuntu only."
  exit 1
fi

echo "[1/4] Installing nginx..."
sudo apt update
sudo apt install -y nginx

echo "[2/4] Writing IP-access nginx config..."
TMP_CONF="$(mktemp)"
cat > "${TMP_CONF}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name _;

    location / {
        proxy_pass https://${WORKER_HOST};
        proxy_http_version 1.1;

        # Keep upstream hostname fixed for Worker routing.
        proxy_set_header Host ${WORKER_HOST};
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;

        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_read_timeout 90s;
        proxy_connect_timeout 15s;
        proxy_send_timeout 90s;
    }
}
EOF

echo "[3/4] Enabling site..."
sudo cp "${TMP_CONF}" /etc/nginx/sites-available/tradelovin
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/tradelovin /etc/nginx/sites-enabled/tradelovin
sudo nginx -t
sudo systemctl reload nginx

SERVER_IP="$(curl -fsSL --max-time 5 https://api.ipify.org || true)"

echo "[4/4] Done."
if [[ -n "${SERVER_IP}" ]]; then
  echo "Temporary test URL: http://${SERVER_IP}"
else
  echo "Temporary test URL: http://<your-server-ip>"
fi
echo "This is for internal testing during ICP filing only."
