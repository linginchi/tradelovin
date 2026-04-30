#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <your-domain.com> <worker-host>"
  echo "Example: $0 tradelovin-hk.com tradelovin.mark-377.workers.dev"
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

echo "[1/5] Installing nginx + certbot..."
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_PATH="${SCRIPT_DIR}/nginx-tradelovin.conf.template"
TMP_CONF="$(mktemp)"

echo "[2/5] Rendering nginx config from template..."
sed "s/__DOMAIN__/${DOMAIN}/g; s/__WORKER_HOST__/${WORKER_HOST}/g" "${TEMPLATE_PATH}" > "${TMP_CONF}"

echo "[3/5] Installing nginx site..."
sudo cp "${TMP_CONF}" /etc/nginx/sites-available/tradelovin
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/tradelovin /etc/nginx/sites-enabled/tradelovin
sudo nginx -t
sudo systemctl reload nginx

echo "[4/5] Issuing TLS certificate with certbot..."
sudo certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" --redirect --non-interactive --agree-tos -m "admin@${DOMAIN}"

echo "[5/5] Done."
echo "Proxy URL: https://${DOMAIN}"
echo "Upstream: https://${WORKER_HOST}"
