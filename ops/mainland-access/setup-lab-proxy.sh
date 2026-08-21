#!/usr/bin/env bash
# 仅新增 lab 子域 Nginx + TLS；不修改 xeoaxis 主站 tradelovin 站点。
set -euo pipefail

LAB_DOMAIN="${1:-lab.xeoaxis.com}"
LAB_PORT="${2:-8765}"
CERT_EMAIL="${3:-admin@${LAB_DOMAIN#lab.}}"

if ! command -v nginx >/dev/null 2>&1; then
  echo "nginx 未安装。请先确认 xeoaxis 主站 Nginx 已存在。"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="${SCRIPT_DIR}/nginx-lab.conf.template"
TMP_CONF="$(mktemp)"

sed "s/__LAB_DOMAIN__/${LAB_DOMAIN}/g; s/__LAB_PORT__/${LAB_PORT}/g" "${TEMPLATE}" > "${TMP_CONF}"

echo "[1/4] 安装 lab Nginx 站点（不触碰 tradelovin）..."
sudo cp "${TMP_CONF}" /etc/nginx/sites-available/lab-xeoaxis
sudo ln -sf /etc/nginx/sites-available/lab-xeoaxis /etc/nginx/sites-enabled/lab-xeoaxis
sudo nginx -t
sudo systemctl reload nginx

echo "[2/4] 申请 TLS（仅 ${LAB_DOMAIN}）..."
if ! command -v certbot >/dev/null 2>&1; then
  sudo apt update
  sudo apt install -y certbot python3-certbot-nginx
fi
sudo certbot --nginx -d "${LAB_DOMAIN}" --redirect --non-interactive --agree-tos -m "${CERT_EMAIL}"

echo "[3/4] 验证 HTTPS..."
curl -sI "https://${LAB_DOMAIN}/" | head -3

echo "[4/4] 完成。"
echo "实验室 URL: https://${LAB_DOMAIN}"
echo "上游: http://127.0.0.1:${LAB_PORT}"
