#!/usr/bin/env bash
# 安装 lab stub systemd 服务（Gate D/E 基础设施；Spike 通过后换 Dojo）
set -euo pipefail

LAB_DIR="${LAB_DIR:-/opt/lab}"
LAB_PORT="${LAB_PORT:-8765}"

echo "[1/5] 创建目录 ${LAB_DIR} ..."
sudo mkdir -p "${LAB_DIR}"
sudo cp "$(dirname "$0")/lab_stub.py" "${LAB_DIR}/lab_stub.py"
sudo chmod 644 "${LAB_DIR}/lab_stub.py"

if [[ ! -f "${LAB_DIR}/.env" ]]; then
  echo "[2/5] 创建 ${LAB_DIR}/.env 模板（请编辑填入密钥）..."
  sudo tee "${LAB_DIR}/.env" >/dev/null <<'EOF'
# 从 Cloudflare Worker 复制（勿提交 git）
LAB_DOJO_SERVER_KEY=
MAIN_APP_BASE_URL=https://leolearnstotrade.com
LAB_PUBLIC_BASE_URL=https://lab.xeoaxis.com
# Spike Gate B 前可留空；配置后 /health/models 会变为 configured=true
ARK_API_KEY=
LAB_VOLCANO_MODEL_ID=pending-spike
EOF
  sudo chmod 600 "${LAB_DIR}/.env"
  echo "请执行: sudo nano ${LAB_DIR}/.env"
else
  echo "[2/5] 保留已有 ${LAB_DIR}/.env"
fi

echo "[3/5] 添加 2G swap（2GiB 内存机器建议）..."
if ! swapon --show | grep -q '/swapfile'; then
  sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

echo "[4/5] 安装 systemd 单元..."
sudo tee /etc/systemd/system/lab-stub.service >/dev/null <<EOF
[Unit]
Description=AI Quant Lab stub (Gate D/E)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${LAB_DIR}
EnvironmentFile=${LAB_DIR}/.env
Environment=LAB_STUB_HOST=127.0.0.1
Environment=LAB_STUB_PORT=${LAB_PORT}
ExecStart=/usr/bin/python3 ${LAB_DIR}/lab_stub.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable lab-stub

echo "[5/5] 启动 lab-stub（需 .env 中 LAB_DOJO_SERVER_KEY 已填）..."
if grep -q '^LAB_DOJO_SERVER_KEY=.\+' "${LAB_DIR}/.env" 2>/dev/null; then
  sudo systemctl restart lab-stub
  sleep 1
  curl -sS -o /dev/null -w 'local stub HTTP %{http_code}\n' "http://127.0.0.1:${LAB_PORT}/"
else
  echo "跳过启动：请先在 ${LAB_DIR}/.env 填入 LAB_DOJO_SERVER_KEY，再运行:"
  echo "  sudo systemctl restart lab-stub"
fi

echo "完成。"
