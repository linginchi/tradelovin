# DojoAgents VPS Runbook（AI 研究实验室）

主站：豹仔学堂（Cloudflare Workers）  
实验室：独立 VPS 上的 DojoAgents（Python）

## 1. 环境变量（VPS only）

| Name | Required | Purpose |
|------|----------|---------|
| `GEMINI_API_KEY` | Yes (MVP) | 多模态诊断 |
| `ZHIPU_API_KEY` / `GLM_API_KEY` | No | 后台切换预留 |
| `LAB_SSO_SECRET` | Yes | 与主站共享，签发/校验 auth code（若用对称签名） |
| `LAB_DOJO_SERVER_KEY` | Yes | Dojo → 主站 exchange / session 回调鉴权 |
| `MAIN_APP_BASE_URL` | Yes | e.g. `https://leolearnstotrade.com` |
| `LAB_PUBLIC_BASE_URL` | Yes | e.g. `https://lab.leolearnstotrade.com` |

**禁止**将上述密钥写入主站 Supabase `lab_config` 或前端。

## 2. 安装（示意）

```bash
uv venv && source .venv/bin/activate
uv pip install 'dojoagents==<LOCKED_VERSION>'
# 配置 ~/.dojo/agents.yaml 或环境变量指向 Gemini
dojoagents dashboard --host 127.0.0.1 --port 8765
# 前挂 Nginx/Caddy TLS，仅暴露必要路径
```

将 `<LOCKED_VERSION>` 在 Spike 通过后写死。

## 3. 必须实现的适配端点

| Endpoint | Role |
|----------|------|
| `GET /sso/callback?code=` | 浏览器入口；服务端 exchange |
| `GET /health/models` | 返回 providers 配置与 vision 能力（给主站 admin）；需 `Authorization: Bearer LAB_DOJO_SERVER_KEY` |
| 拉取启用模型 | `GET {MAIN_APP_BASE_URL}/api/lab/active-model`（同上服务端密钥） |
| 诊断完成回调 | `POST {MAIN_APP_BASE_URL}/api/lab/session` |

`/health/models` 建议响应形状：

```json
{
  "providers": [
    {
      "id": "gemini",
      "configured": true,
      "visionCapable": true,
      "models": ["gemini-2.0-flash"]
    },
    {
      "id": "glm",
      "configured": false,
      "visionCapable": false,
      "models": [],
      "reason": "ZHIPU_API_KEY missing"
    }
  ]
}
```

## 4. SSO 流程

1. 用户在主站 `/lab` 点击进入 → `POST /api/lab/sso` → `code`  
2. 浏览器跳转 `{LAB_PUBLIC_BASE_URL}/sso/callback?code=…`  
3. Dojo 服务端 `POST {MAIN}/api/lab/sso/exchange` + `Authorization: Bearer {LAB_DOJO_SERVER_KEY}`  
4. 设置 HttpOnly session cookie；后续诊断使用该会话  

## 5. 模型切换

- 主站 `lab_config.active_model` 决定新建诊断用的 provider/model。  
- Dojo 每次诊断前读取主站配置（或主站在 exchange 时下发）。  
- 仅当 `/health/models` 中该 provider `configured && visionCapable` 时允许切换。

## 6. 合规

- Prompt：教学用途；用户报告去标的化。  
- 回调前尽量本地清洗；主站 `compliance-filter` 为最终门禁。

## 7. Fallback

若 Spike Gate 失败：用轻量 FastAPI + Gemini SDK 替代 Dojo UI，保持与主站相同的 SSO / session / health 接口形状。
