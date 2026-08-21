# AI量化实验室 · 主站验收（迁移 + 环境变量 + 冒烟）

在 VPS / Dojo 接通之前，先完成主站侧落地。未配置 `LAB_PUBLIC_BASE_URL` 时，「进入实验室」会提示服务未配置——属预期。对外主名：**AI量化实验室**。

提供商 **仅 volcano**。密钥只放 VPS，禁止把火山 / Gemini / GLM API Key 写进主站或 `lab_config`。

---

## 1. 应用数据库迁移

须 **两份** 迁移都已应用：

1. [`supabase/migrations/20260724140000_lab_research.sql`](../../supabase/migrations/20260724140000_lab_research.sql) — 初始表：`lab_sessions` / `lab_config` / `lab_sso_codes`
2. [`supabase/migrations/20260821041119_lab_volcano_provider.sql`](../../supabase/migrations/20260821041119_lab_volcano_provider.sql) — provider 收敛为 volcano；`active_model` 更新为 pending-spike

原始 `20260724140000` **仍保留**（建表），不要删；火山约束在第二份迁移。

### 方式 A：Supabase Dashboard（推荐，无 CLI 时）

1. 打开目标项目 → **SQL Editor**
2. 按时间顺序粘贴上述两份迁移全文并分别 **Run**
3. 在 **Table Editor** 确认存在：
   - `lab_sessions`
   - `lab_config`（应有一行 `key=active_model`）
   - `lab_sso_codes`

### 方式 B：CLI（已安装并 link 时）

```bash
supabase db push
```

### 结构验收 SQL

```sql
select key, value from public.lab_config where key = 'active_model';
-- 期望（第二份迁移 apply 后）: {"provider":"volcano","model_id":"pending-spike"}

select tablename from pg_tables
where schemaname = 'public'
  and tablename in ('lab_sessions', 'lab_config', 'lab_sso_codes');
```

---

## 2. 配置环境变量

密钥用随机串生成（示例）：

```bash
openssl rand -hex 32   # → LAB_SSO_SECRET
openssl rand -hex 32   # → LAB_DOJO_SERVER_KEY
```

| 变量 | 类型 | 本地 | Cloudflare Worker |
|------|------|------|-------------------|
| `LAB_SSO_SECRET` | Secret | `.dev.vars` / `.env.local` | Worker Secret |
| `LAB_DOJO_SERVER_KEY` | Secret | 同上 | Worker Secret |
| `LAB_PUBLIC_BASE_URL` | Var（可选，未接 VPS 可暂空） | 同上 | Worker Var |

说明：

- `LAB_SSO_SECRET` / `LAB_DOJO_SERVER_KEY` **必须**与未来 VPS 一致。
- 未设 `LAB_PUBLIC_BASE_URL` 时：入口页、SSO 签发、后台配置仍可用；点击「进入实验室」会 toast「服务尚未配置」。
- **禁止**把 API Key（`ARK_API_KEY` / `VOLC_ACCESS_KEY` / `VOLC_SECRET_KEY`，以及任何 Gemini/GLM key）写进主站或 `lab_config`。火山密钥 **仅 VPS**。

### 本地示例（`.env.local` 或 `.dev.vars`，勿提交）

```bash
LAB_SSO_SECRET=<openssl rand -hex 32>
LAB_DOJO_SERVER_KEY=<openssl rand -hex 32>
# LAB_PUBLIC_BASE_URL=https://lab.example.com   # VPS 就绪后再填
```

### Cloudflare（生产）

```bash
npx wrangler secret put LAB_SSO_SECRET
npx wrangler secret put LAB_DOJO_SERVER_KEY
# 可选：
# npx wrangler secret put 不适用；公开 URL 用 vars：
# 在 Dashboard → Worker → Variables 增加 LAB_PUBLIC_BASE_URL
```

部署后需重新 `deploy`（或至少确保 secrets 已绑定到当前 Worker）再验。

---

## 3. 主站冒烟验收清单

前置：已登录账号；准备一个 **T2/T3 active** 与一个 **T1/试用** 账号。

### 3.1 导航与叙事

- [ ] 登录后顶栏可见「T0 训练盘」「AI量化实验室」
- [ ] 打开 `/trade`：顶部有 T0 叙事 +「AI量化实验室」链接
- [ ] 打开 `/lab`：有全局叙事、做什么/不做什么、合规短句

### 3.2 会员门禁

- [ ] T1 / 试用：`/lab` 显示「需 P2 · 云豹及以上」+ 升级链接；点进入应失败（403）
- [ ] T2+：显示「进入实验室」按钮

### 3.3 SSO 签发（可不跳 VPS）

T2+ 浏览器控制台或：

```bash
# 需带登录 Cookie
curl -i -X POST "$BASE_URL/api/lab/sso" \
  -H "Cookie: $USER_COOKIE"
```

期望：

- `200` + `success: true` + `code` + `expiresIn: 60`
- 未配 `LAB_PUBLIC_BASE_URL` 时 `labBaseUrl` 可为 `null`
- 页面点击进入：有「服务尚未配置」提示（未配 URL 时）

### 3.4 Exchange 鉴权

```bash
# 无密钥 → 401
curl -i -X POST "$BASE_URL/api/lab/sso/exchange" \
  -H "Content-Type: application/json" \
  -d '{"code":"dummy"}'

# 正确密钥 + 刚签发的 code → 200 + sessionToken
curl -i -X POST "$BASE_URL/api/lab/sso/exchange" \
  -H "Authorization: Bearer $LAB_DOJO_SERVER_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"code\":\"$CODE\"}"
```

- [ ] 同一 `code` 第二次兑换失败（单次消费）

### 3.5 Session 回写 + 合规

```bash
# 合规报告 → 200
curl -i -X POST "$BASE_URL/api/lab/session" \
  -H "Authorization: Bearer $LAB_DOJO_SERVER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "userId":"<T2_USER_UUID>",
    "provider":"volcano",
    "model":"pending-spike",
    "inputSummary":"验收用模拟上传",
    "outputJson":{
      "version":"lab-diagnose-v1",
      "summary":"组合行业集中度偏高，防御性暴露不足。",
      "riskThemes":["行业集中","防御不足"],
      "sectorExposure":[{"sector":"科技","weightNote":"占比偏高"}],
      "concentrationNotes":["单一主题暴露偏大"],
      "teachingQuestions":["若该主题回撤，你的计划是什么？"],
      "disclaimer":"本报告仅供学习训练，不构成投资建议；不荐股、无实盘。"
    }
  }'

# 含荐股用语 → 422
# summary 改为「建议买入某某」应被拦截
```

- [ ] T2+ `GET /api/lab/session` 能看到刚写入的历史
- [ ] `/lab` 页面「最近诊断」列表出现该条

### 3.6 后台模型切换

- [ ] 超管打开 `/cjkzt/lab`
- [ ] 可见当前 `volcano / pending-spike`（第二份迁移 apply 后）
- [ ] 无 Gemini / GLM 开关；仅 volcano model id（来自 health 列表；未接 VPS 时为占位 `pending-spike`）
- [ ] 未接 VPS 时 volcano 健康检查为不可用；**无法**保存切换到未通过检查的模型
- [ ] 「刷新健康检查」不报 500

---

## 4. 通过标准（本阶段）

全部勾选即可认为 **主站 P0（无 VPS）验收通过**，可进入 VPS Spike。

**不得**据此宣称 Spike Gate 已通过，也 **不得**宣称端到端可用。

未通过时常见原因：

| 现象 | 排查 |
|------|------|
| SSO 503「写入授权码失败」 | 迁移未应用 / service role 未配 |
| 403 会员 | 账号非 T2+ active |
| 后台无法保存模型 | 预期：Dojo health 未通 |
| exchange 一直 401 | `LAB_DOJO_SERVER_KEY` 主站未配或与 curl 不一致 |
| `active_model` 仍是 gemini | 第二份迁移 `20260821041119_lab_volcano_provider.sql` 未 apply |
