#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <filed-domain> <worker-host>"
  echo "Example: $0 tradelovin.cn tradelovin.mark-377.workers.dev"
  exit 1
fi

DOMAIN="$1"
WORKER_HOST="$2"

if [[ "$WORKER_HOST" == http* ]]; then
  echo "Please pass worker host only, without protocol."
  echo "Expected: tradelovin.mark-377.workers.dev"
  exit 1
fi

if ! command -v apt >/dev/null 2>&1; then
  echo "This script currently supports Debian/Ubuntu only."
  exit 1
fi

echo "[1/5] Installing certbot..."
sudo apt update
sudo apt install -y certbot python3-certbot-nginx

echo "[2/5] Writing domain nginx config..."
TMP_CONF="$(mktemp)"
cat > "${TMP_CONF}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    location / {
        proxy_pass https://${WORKER_HOST};
        proxy_http_version 1.1;

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

    location /_next/static/ {
        proxy_pass https://${WORKER_HOST}/_next/static/;
        proxy_http_version 1.1;

        proxy_set_header Host ${WORKER_HOST};
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";

        expires 1d;
        add_header Cache-Control "public, max-age=86400, immutable";
    }
}
EOF

echo "[3/5] Enabling site..."
sudo cp "${TMP_CONF}" /etc/nginx/sites-available/tradelovin
sudo ln -sf /etc/nginx/sites-available/tradelovin /etc/nginx/sites-enabled/tradelovin
sudo nginx -t
sudo systemctl reload nginx

echo "[4/5] Requesting TLS cert (Let's Encrypt)..."
sudo certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" --redirect --non-interactive --agree-tos -m "admin@${DOMAIN}"

echo "[5/5] Done."
echo "Production URL: https://${DOMAIN}"
