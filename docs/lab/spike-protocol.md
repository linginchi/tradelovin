# AI 量化实验室 · DojoAgents + Gemini Spike Protocol

**文档状态：** 工具与验收步骤已备妥  
**外部 Spike 状态：** 尚未执行（无 Gate A–E 通过证据）  
**目的：** 证明或否证 Dojo 路径是否满足 P0；任一硬 Gate 失败时仅输出「建议 fallback」，**不得**在本任务中实施 fallback。

关联文档：

- [spike-checklist.md](./spike-checklist.md) — 决策勾选表（手工填写）
- [dojo-vps-runbook.md](./dojo-vps-runbook.md) — VPS 部署与接口形状
- [env.sample](./env.sample) — 环境变量样例（勿提交真实值）

---

## 0. 执行边界

| 类别 | 本仓库已提供 | 须在外部 VPS / 主站完成 |
|------|-------------|------------------------|
| Spike runner | `npm run spike:lab:check` | 配置 `LAB_PUBLIC_BASE_URL`、`LAB_DOJO_SERVER_KEY` |
| 离线校验 | `npm run test:lab`（含 spike 单测） | — |
| Gate A 自托管 | 命令模板 | 目标 VPS + Python/uv |
| Gate B 多模态 | 截图规格 + 记录模板 | `GEMINI_API_KEY` + Dojo 进程 |
| Gate C 去标的化 JSON | schema + compliance filter | Dojo 诊断输出样例 |
| Gate D SSO + 回调 | 流程说明 | 主站 + VPS 联调 |
| Gate E 健康检查 | runner 可自动验 `/health/models` | VPS 上 Dojo 已启动 |

**MacBook 本机（无 VPS URL）：** `npm run spike:lab:check` 必须 **fail closed**（退出码 1），提示缺少 `LAB_PUBLIC_BASE_URL` / `LAB_DOJO_SERVER_KEY`，且 **不发起** 外部 HTTP 请求。

---

## 1. 前置准备

### 1.1 环境变量（VPS / Spike 执行机）

从 [env.sample](./env.sample) 复制；**禁止**提交含真实 secret 的文件。

| 变量 | Gate | 说明 |
|------|------|------|
| `LAB_PUBLIC_BASE_URL` | D, E | 实验室公网根 URL，如 `https://lab.leolearnstotrade.com` |
| `LAB_DOJO_SERVER_KEY` | D, E | 与主站一致；用于 `/health/models` 与主站回调 |
| `LAB_SSO_SECRET` | D | 与主站一致（exchange / session JWT） |
| `MAIN_APP_BASE_URL` | D | 主站根 URL |
| `GEMINI_API_KEY` | B, C | **仅 VPS**；Dojo 多模态诊断 |
| `ZHIPU_API_KEY` / `GLM_API_KEY` | E（可选） | 未配置时 GLM 须 `configured=false` |

可选覆盖：`LAB_SPIKE_LAB_BASE_URL` — 仅 Spike runner 使用，覆盖 `LAB_PUBLIC_BASE_URL`（便于对 staging 做检查）。

### 1.2 记录模板（每个 Gate 必填）

保存到 `docs/lab/evidence/`（**勿提交** secret、截图、JWT）：

```json
{
  "gate": "B",
  "executedAt": "2026-07-25T12:00:00.000Z",
  "executor": "姓名或工号",
  "dojoagentsVersion": "x.y.z 或 git SHA",
  "geminiModelId": "gemini-2.0-flash",
  "latencyMs": 4200,
  "inputTokens": 1200,
  "outputTokens": 450,
  "estimatedCostUsd": 0.002,
  "result": "pass",
  "notes": "匿名截图 A；无股票代码进入报告"
}
```

**成本估算（示意）：** 查阅 Google AI 定价页，按 `inputTokens` / `outputTokens` × 单价；记录 **估算值** 与 **model id**，勿写入 API key。

### 1.3 三份匿名 / 虚构测试截图规格

**禁止：** 真实持仓、券商 UI 账号、姓名、手机号、邮箱、API key、水印含 PII。

| ID | 虚构场景 | 画面须含 | 须不含 |
|----|----------|----------|--------|
| **anon-A** | 「教学组合 A」行业饼图 | 行业标签：科技 / 消费 / 金融 / 防御；占比文字 | 股票代码、公司全名、账户号 |
| **anon-B** | 「教学组合 B」主题暴露条形图 | 3–5 个主题名（如「成长」「高股息」）；权重区间 | ticker、买卖按钮、订单号 |
| **anon-C** | 「教学组合 C」集中度热力 | 2×3 区块 + 「Top 暴露偏高」类文案 | 6 位数字代码、荐股用语 |

文件命名建议（本地/VPS，**勿入库**）：`anon-A.png`、`anon-B.png`、`anon-C.png`。

---

## 2. Gate A — 自托管（须 VPS）

**依赖：** 目标 VPS、Python 3.11+、`uv`、出站 PyPI。

### 步骤

```bash
ssh user@YOUR_VPS
uv venv && source .venv/bin/activate
uv pip install 'dojoagents==CANDIDATE_VERSION'
python -c "import importlib.metadata as m; print(m.version('dojoagents'))"
dojoagents dashboard --host 127.0.0.1 --port 8765
# 另开终端
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8765/
```

### 预期输出

- `uv pip install` 退出码 `0`
- 版本打印为一行 semver 或 dev 版本
- `curl` HTTP 状态码 `200` 或 `302`（dashboard 可达）

### Pass / Fail

| 结果 | 判准 |
|------|------|
| **Pass** | 安装成功、dashboard 可访问、版本号已记入 evidence |
| **Fail** | 安装失败、进程无法启动、端口不可达 |

**Fail 时输出：** `建议 fallback（尚未实施）` — 停止后续 Gate，更新 [spike-checklist.md](./spike-checklist.md) 决策区。

**注意：** Spike **通过前** 不得在 runbook 中锁定 `<LOCKED_VERSION>`。

---

## 3. Gate B — Gemini 多模态（须 VPS + GEMINI_API_KEY）

**依赖：** Gate A Pass、`GEMINI_API_KEY` 已配置到 Dojo。

### 步骤

1. 在 Dojo 中选择支持 vision 的 Gemini model id（记录到 evidence）。
2. 依次上传 **anon-A / anon-B / anon-C**（见 §1.3）。
3. 每次记录：开始/结束时间 → `latencyMs`；Dojo 或 Gemini 控制台中的 token 用量。
4. 确认 UI 有「不上传 PII / 教学用途」类同意文案（是/否写入 checklist）。

### 预期输出

- 三次请求均返回结构化或半结构化诊断（非空）
- 无 API key 出现在 UI、日志或截图

### Pass / Fail

| 结果 | 判准 |
|------|------|
| **Pass** | ≥3 张匿名截图均完成识别/诊断；model id、延迟、token、估算成本已记录 |
| **Fail** | vision 不可用、连续失败、或输出明显无法进入 Gate C |

**Fail 时输出：** `建议 fallback（尚未实施）`。

---

## 4. Gate C — 去标的化 JSON（须 VPS + Gate B 输出）

**依赖：** Gate B Pass；主站 `report-schema` + `compliance-filter`（本仓库已实现）。

### 步骤

1. 从 Dojo 取得 JSON 样例（或 prompt 输出），保存为 `gate-c-sample.json`（**勿提交**）。
2. 在 VPS 或 CI 机（有 Node 工具链）执行：

```bash
cd /path/to/tradelovin
npm run test:lab
node --loader ./tests/lab/ts-loader.mjs scripts/lab/spike-check.ts \
  --report /path/to/gate-c-sample.json
```

3. **诱导荐股测试：** 构造含「建议买入」或虚构 6 位代码的 JSON，确认 `filterLabReport` 返回 `ok: false`。

### 预期输出

- 合规样例：`executionStatus: "report_pass"` 或 filter `ok: true`
- 违规样例：`report_fail` 或 filter 带中文拦截原因
- 用户可见字段 **无** symbols / tickers / orders

### Pass / Fail

| 结果 | 判准 |
|------|------|
| **Pass** | 正常样例通过 schema + compliance；诱导样例被拦截 |
| **Fail** | 无法产出合规 JSON，或违规内容未被拦截 |

**Fail 时输出：** `建议 fallback（尚未实施）`。

---

## 5. Gate D — SSO + 回调（须 VPS + 主站已配置）

**依赖：** 主站 `LAB_SSO_SECRET`、`LAB_DOJO_SERVER_KEY`、迁移已应用；VPS `MAIN_APP_BASE_URL`、`LAB_PUBLIC_BASE_URL`。

### 步骤（概要）

1. T2+ 账号登录主站 → `POST /api/lab/sso` → 获得 `code`（**勿写入 evidence 全文**）。
2. 浏览器访问 `{LAB_PUBLIC_BASE_URL}/sso/callback?code=...`。
3. Dojo 服务端 `POST {MAIN}/api/lab/sso/exchange`（Bearer `LAB_DOJO_SERVER_KEY`）。
4. 完成一次诊断后 `POST {MAIN}/api/lab/session`。
5. 检查：session cookie 为 HttpOnly；URL 无长期 JWT；同一 `code` 二次 exchange 失败。

详细 curl 见 [main-site-acceptance.md](./main-site-acceptance.md) §3.4–3.5。

### Pass / Fail

| 结果 | 判准 |
|------|------|
| **Pass** | 全流程一次成功；code 单次消费；历史可在 `/lab` 列出 |
| **Fail** | exchange 401、重复消费成功、或 session 回写 403 |

**Fail 时输出：** `建议 fallback（尚未实施）`。

---

## 6. Gate E — 模型健康检查（VPS + runner 可自动）

**依赖：** Dojo 暴露 `GET /health/models`（Bearer `LAB_DOJO_SERVER_KEY`）。

### 手工 curl

```bash
export LAB_PUBLIC_BASE_URL=https://lab.example.com
export LAB_DOJO_SERVER_KEY='***'
curl -sS -H "Authorization: Bearer $LAB_DOJO_SERVER_KEY" \
  "$LAB_PUBLIC_BASE_URL/health/models" | jq .
```

### 预期形状

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

### 自动检查（推荐）

```bash
export LAB_PUBLIC_BASE_URL=https://lab.example.com
export LAB_DOJO_SERVER_KEY='***'
npm run spike:lab:check
# 可选：附带 Gate C 样例
npm run spike:lab:check -- --report ./gate-c-sample.json
```

### Pass / Fail

| 结果 | 判准 |
|------|------|
| **Pass** | Gemini 须 `configured=true` 且 `visionCapable=true`；GLM **若未配置** 须 `configured=false` 且 `visionCapable=false`（安全关闭态）；GLM **若已配置** 须 `visionCapable=true`（已配置且具备 vision 视为可用） |
| **Fail** | 响应缺字段；Gemini 不可用；GLM 已配置但 `visionCapable=false`；GLM 状态不一致；HTTP 非 200 |

**说明：** GLM 已配置且 `visionCapable=true` **可以** Pass；失败原因是「已配置却无 vision 能力」或 Gemini 不可用，而非「GLM 已配置」本身。

**Fail 时：** runner 输出 `"suggestFallback": true` 与 `"建议 fallback（尚未实施）"`。

### 输出安全（runner）

- 摘要 JSON **不得**含 `LAB_DOJO_SERVER_KEY`、Authorization、JWT、code 或 API key。
- `LAB_PUBLIC_BASE_URL` 不得含 username/password/query/fragment；违规时 fail closed，仅输出安全原因（不回显原始 URL）。
- 网络失败时输出 `errorCategory: "health_request_failed"`，不回显原始 URL 或底层 error message。
- 合法 HTTPS base URL 在摘要中仅保留净化后的 hostname/path。

---

## 7. 决策（手工）

在 [spike-checklist.md](./spike-checklist.md) 勾选 **仅当 A–E 均有证据**：

| 选项 | 条件 |
|------|------|
| 继续 Dojo 路径 | 全部 Gate Pass |
| 建议 fallback | 任一硬 Gate Fail（**不在此仓库实现**） |

---

## 8. 工具命令速查

| 命令 | 环境 | 说明 |
|------|------|------|
| `npm run test:lab` | 本机 | P0 + Spike 离线单测；无网络 |
| `npm run spike:lab:check` | VPS（或可达 lab URL 的机器） | 只读 GET `/health/models`；缺 env 则 fail closed |
| `npm run build` | 本机 | 确保主站仍可构建 |

**输出约束：** runner 摘要 JSON **不得**含 Authorization、JWT、code、API key、原始图片。

---

## 9. 当前结论（模板）

> **工具已备妥：** Spike protocol、runner、离线测试已在仓库内。  
> **外部 Spike 尚未执行：** Gate A–E 无 Pass 证据；Dojo/Gemini 能力 **未** 验证为可用。  
> **下一步：** 在目标 VPS 配置环境变量后，按 Gate 顺序执行并填写 checklist + evidence JSON。
