#!/usr/bin/env python3
"""Minimal lab HTTP stub for Gate D/E wiring (Spike infra). Replace with Dojo when Gate A passes."""

from __future__ import annotations

import hmac
import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

HOST = os.environ.get("LAB_STUB_HOST", "127.0.0.1")
PORT = int(os.environ.get("LAB_STUB_PORT", "8765"))
MAIN_APP_BASE_URL = os.environ.get("MAIN_APP_BASE_URL", "https://leolearnstotrade.com").rstrip("/")
LAB_DOJO_SERVER_KEY = os.environ.get("LAB_DOJO_SERVER_KEY", "").strip()
ARK_API_KEY = os.environ.get("ARK_API_KEY", "").strip()
MODEL_ID = os.environ.get("LAB_VOLCANO_MODEL_ID", "pending-spike").strip() or "pending-spike"


def authorized(header: str | None) -> bool:
	if not LAB_DOJO_SERVER_KEY or not header:
		return False
	token = header[7:].strip() if header.startswith("Bearer ") else header.strip()
	return hmac.compare_digest(token, LAB_DOJO_SERVER_KEY)


def health_payload() -> dict[str, Any]:
	volcano_ready = bool(ARK_API_KEY)
	return {
		"providers": [
			{
				"id": "volcano",
				"configured": volcano_ready,
				"visionCapable": volcano_ready,
				"models": [MODEL_ID],
				**(
					{}
					if volcano_ready
					else {"reason": "ARK_API_KEY 未配置；Spike Gate B 前为预期状态"}
				),
			}
		]
	}


def exchange_code(code: str) -> dict[str, Any]:
	body = json.dumps({"code": code}).encode("utf-8")
	req = urllib.request.Request(
		f"{MAIN_APP_BASE_URL}/api/lab/sso/exchange",
		data=body,
		method="POST",
		headers={
			"Content-Type": "application/json",
			"Authorization": f"Bearer {LAB_DOJO_SERVER_KEY}",
		},
	)
	with urllib.request.urlopen(req, timeout=30) as resp:
		return json.loads(resp.read().decode("utf-8"))


class Handler(BaseHTTPRequestHandler):
	server_version = "lab-stub/0.1"

	def log_message(self, fmt: str, *args: Any) -> None:
		print(f"{self.address_string()} - {fmt % args}")

	def _json(self, status: int, payload: dict[str, Any]) -> None:
		data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
		self.send_response(status)
		self.send_header("Content-Type", "application/json; charset=utf-8")
		self.send_header("Content-Length", str(len(data)))
		self.end_headers()
		self.wfile.write(data)

	def _html(self, status: int, title: str, body: str) -> None:
		page = f"""<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>{title}</title></head><body>{body}</body></html>"""
		data = page.encode("utf-8")
		self.send_response(status)
		self.send_header("Content-Type", "text/html; charset=utf-8")
		self.send_header("Content-Length", str(len(data)))
		self.end_headers()
		self.wfile.write(data)

	def do_GET(self) -> None:  # noqa: N802
		if self.path == "/health/models":
			if not authorized(self.headers.get("Authorization")):
				self._json(401, {"error": "未授权"})
				return
			self._json(200, health_payload())
			return

		if self.path.startswith("/sso/callback"):
			from urllib.parse import parse_qs, urlparse

			query = parse_qs(urlparse(self.path).query)
			code = (query.get("code") or [""])[0].strip()
			if not code:
				self._html(400, "缺少 code", "<h1>缺少授权码</h1>")
				return
			if not LAB_DOJO_SERVER_KEY:
				self._html(503, "未配置", "<h1>LAB_DOJO_SERVER_KEY 未配置</h1>")
				return
			try:
				exchanged = exchange_code(code)
			except urllib.error.HTTPError as err:
				detail = err.read().decode("utf-8", errors="replace")
				self._html(err.code, "兑换失败", f"<h1>SSO 兑换失败</h1><pre>{detail}</pre>")
				return
			except Exception as err:  # noqa: BLE001
				self._html(502, "兑换失败", f"<h1>SSO 兑换失败</h1><pre>{err}</pre>")
				return

			if not exchanged.get("success"):
				self._html(400, "兑换失败", f"<h1>SSO 兑换失败</h1><pre>{json.dumps(exchanged, ensure_ascii=False)}</pre>")
				return

			token = str(exchanged.get("sessionToken") or "")
			self.send_response(200)
			self.send_header("Content-Type", "text/html; charset=utf-8")
			self.send_header(
				"Set-Cookie",
				f"lab_session={token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age={int(exchanged.get('expiresIn') or 3600)}",
			)
			self.end_headers()
			self.wfile.write(
				"<h1>AI量化实验室</h1><p>SSO 已成功。基础设施就绪，待 Spike Gate A–C 接入 Dojo 诊断 UI。</p>".encode(
					"utf-8"
				)
			)
			return

		if self.path in ("/", "/health"):
			self._html(200, "AI量化实验室", "<h1>AI量化实验室</h1><p>lab stub 运行中。</p>")
			return

		self._json(404, {"error": "not_found"})


def main() -> None:
	if not LAB_DOJO_SERVER_KEY:
		print("WARN: LAB_DOJO_SERVER_KEY 未设置，/health/models 与 SSO 将不可用")
	httpd = ThreadingHTTPServer((HOST, PORT), Handler)
	print(f"lab stub listening on http://{HOST}:{PORT}")
	httpd.serve_forever()


if __name__ == "__main__":
	main()
