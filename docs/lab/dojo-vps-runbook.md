# DojoAgents VPS Runbook（AI量化实验室）

主站：豹仔学堂（Cloudflare Workers）  
实验室：独立 VPS 上的 DojoAgents（Python）  
提供商：**仅 volcano**（无 Gemini / GLM 切换）

## 1. 环境变量（VPS only）

| Name | Required | Purpose |
|------|----------|---------|
| `ARK_API_KEY` | TBD（**Path A**） | 火山方舟 Ark 多模态。见 `scripts/test/leo-001/`。与 Path B 二选一，Spike 锁定。 |
| `VOLC_ACCESS_KEY` | TBD（**Path B**） | 视觉智能 visual Access Key。见 `scripts/test/leo-003/`、`leo-004/`。 |
| `VOLC_SECRET_KEY` | TBD（**Path B**） | 视觉智能 visual Secret Key。与 `VOLC_ACCESS_KEY` 成对。 |
| `LAB_SSO_SECRET` | Yes | 与主站共享，签发/校验 auth code（若用对称签名） |
| `LAB_DOJO_SERVER_KEY` | Yes | Dojo → 主站 exchange / session 回调鉴权 |
| `MAIN_APP_BASE_URL` | Yes | e.g. `https://leolearnstotrade.com` |
| `LAB_PUBLIC_BASE_URL` | Yes | e.g. `https://lab.leolearnstotrade.com` |

**禁止**将上述密钥写入主站 Supabase `lab_config` 或前端或 git。主站默认 `active_model` 为 `{ "provider": "volcano", "model_id": "pending-spike" }`；真实 Doubao/Ark model id 由 Spike 锁定，勿事先臆造。

## 2. 安装（示意）

```bash
uv venv && source .venv/bin/activate
uv pip install 'dojoagents==<LOCKED_VERSION>'
# 配置 ~/.dojo/agents.yaml 或环境变量指向火山（Path A 或 Path B，Spike 锁定后写死）
dojoagents dashboard --host 127.0.0.1 --port 8765
# 前挂 Nginx/Caddy TLS，仅暴露必要路径
```

将 `<LOCKED_VERSION>` 在 Spike 通过后写死。

## 3. 必须实现的适配端点

| Endpoint | Role |
|----------|------|
| `GET /sso/callback?code=` | 浏览器入口；服务端 exchange |
| `GET /health/models` | 返回 volcano 配置与 vision 能力（给主站 admin）；需 `Authorization: Bearer LAB_DOJO_SERVER_KEY` |
| 拉取启用模型 | `GET {MAIN_APP_BASE_URL}/api/lab/active-model`（同上服务端密钥） |
| 诊断完成回调 | `POST {MAIN_APP_BASE_URL}/api/lab/session` |

`/health/models` 形状 **恰好一个** volcano provider：

```json
{
  "providers": [
    {
      "id": "volcano",
      "configured": true,
      "visionCapable": true,
      "models": ["<Spike 锁定的 model id>"]
    }
  ]
}
```

未知 `id`（如 gemini / glm）忽略。`volcano` 出现两次则形状失败。Gate E Pass：`configured=true` 且 `visionCapable=true`。

## 4. SSO 流程

1. 用户在主站 `/lab` 点击进入 → `POST /api/lab/sso` → `code`  
2. 浏览器跳转 `{LAB_PUBLIC_BASE_URL}/sso/callback?code=…`  
3. Dojo 服务端 `POST {MAIN}/api/lab/sso/exchange` + `Authorization: Bearer {LAB_DOJO_SERVER_KEY}`  
4. 设置 HttpOnly session cookie；后续诊断使用该会话  

## 5. 模型切换

- 主站 `lab_config.active_model` 决定新建诊断用的 provider/model。provider **固定** `volcano`。  
- 后台无 Gemini / GLM 开关；仅可从 `/health/models` 列出的 volcano model id 中选择。  
- Dojo 每次诊断前读取主站配置（或主站在 exchange 时下发）。  
- 仅当 volcano `configured && visionCapable` 且所选 id 在 `models` 列表中时允许保存。  
- Spike 锁定前占位 `pending-spike`。

## 6. 合规

- Prompt：教学用途；用户报告去标的化。  
- 回调前尽量本地清洗；主站 `compliance-filter` 为最终门禁。

## 7. Fallback

若 Spike Gate 失败：用轻量 FastAPI + **volcano SDK** 替代 Dojo UI（非 Gemini），保持与主站相同的 SSO / session / health 接口形状。密钥仍仅存 VPS。
