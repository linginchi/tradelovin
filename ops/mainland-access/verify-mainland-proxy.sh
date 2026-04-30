#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <entry-host-or-ip> <worker-host> [scheme]"
  echo "Example phase1: $0 47.88.10.20 tradelovin.mark-377.workers.dev http"
  echo "Example phase2: $0 tradelovin.cn tradelovin.mark-377.workers.dev https"
  exit 1
fi

ENTRY="$1"
WORKER_HOST="$2"
SCHEME="${3:-https}"
ENTRY_URL="${SCHEME}://${ENTRY}"

echo "== Entry target =="
echo "${ENTRY_URL}"

echo
echo "== DNS (skip for raw IP) =="
if [[ "${ENTRY}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "raw ip: ${ENTRY}"
else
  if command -v dig >/dev/null 2>&1; then
    dig +short "${ENTRY}" A
  else
    nslookup "${ENTRY}" || true
  fi
fi

echo
echo "== HEAD via entry =="
curl -I --max-time 20 "${ENTRY_URL}" || true

echo
echo "== Quick health check via entry =="
curl -sS --max-time 20 -o /dev/null -w "entry_status=%{http_code}\n" "${ENTRY_URL}"

echo
echo "== Compare worker direct response =="
curl -sS --max-time 20 -o /dev/null -w "worker_status=%{http_code}\n" "https://${WORKER_HOST}"

echo
echo "== Done =="
echo "If entry_status is 200 and key flows work, you can invite Mainland testers."
