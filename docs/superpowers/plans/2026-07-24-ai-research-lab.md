# AI 研究实验室 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 `/lab` 组合诊断 MVP（T2+、Gemini 多模态、auth-code SSO、去标的化报告、后台可切换 GLM）。

**Architecture:** 主站负责会员门禁、SSO 授权码、合规过滤、`lab_*` 存储与后台配置；DojoAgents 跑在独立 VPS，负责截图 UI 与多模态调用，服务端兑换 session 后回调主站落库。

**Tech Stack:** Next.js 16 / Cloudflare Workers / Supabase / jose / DojoAgents (Python VPS) / Gemini API

**Spec:** [docs/superpowers/specs/2026-07-24-ai-research-lab-design.md](../specs/2026-07-24-ai-research-lab-design.md)

## Global Constraints

- 品牌中文名：豹仔学堂；叙事含：基础课程（线上）、高阶导师亲授（线下）、执行练习、量化投研实验、不荐股、无实盘。
- 用户可见报告必须去标的化；禁止买卖指令。
- API Key 仅存 VPS；`lab_config` 无密钥。
- 默认 provider：`gemini`；`glm` 需健康检查通过才可选。
- SSO：一次性授权码（≤60s），禁止把长期 JWT 放 URL。
- Spike Gate 未通过前，不得宣称 P0 完成。

---

## File map (main repo)

| Path | Responsibility |
|------|----------------|
| `supabase/migrations/20260724140000_lab_research.sql` | `lab_sessions` + `lab_config` + RLS |
| `src/lib/membership/types.ts` | `lab_access` capability |
| `src/lib/membership/guard.ts` | T2+ gating |
| `src/lib/lab/compliance-filter.ts` | 三层合规后处理入口 |
| `src/lib/lab/report-schema.ts` | Zod schema for de-tickerized report |
| `src/lib/lab/sso.ts` | auth code issue / exchange / consume |
| `src/app/api/lab/sso/route.ts` | issue code (user) |
| `src/app/api/lab/sso/exchange/route.ts` | Dojo server exchange |
| `src/app/api/lab/session/route.ts` | list + writeback |
| `src/app/api/admin/lab-config/route.ts` | GET/PUT active model |
| `src/app/api/admin/lab-models/route.ts` | proxy Dojo health |
| `src/app/[locale]/(dashboard)/lab/page.tsx` | entry UI |
| `src/components/lab/LabEntryClient.tsx` | narrative + CTA + history |
| `src/components/admin/AdminLabConfigPanel.tsx` | model switch UI |
| `src/app/cjkzt/(protected)/lab/page.tsx` | admin page |
| `messages/{zh,zh-TW,en}.json` | Lab / Admin copy |
| `docs/lab/spike-checklist.md` | Spike Gate 记录模板 |
| `docs/lab/dojo-vps-runbook.md` | VPS 部署与密钥 runbook |

---

### Task 0: Spike Gate documentation + decision log

**Files:**
- Create: `docs/lab/spike-checklist.md`
- Create: `docs/lab/dojo-vps-runbook.md`

- [ ] **Step 1:** 写 Spike 清单：Dojo 版本、Gemini model id、截图样例通过率、去标的化 JSON 样例、SSO 探针、失败时自研 fallback 决策位。
- [ ] **Step 2:** 写 VPS runbook：安装 `dojoagents`、环境变量 `GEMINI_API_KEY` / 预留 `ZHIPU_API_KEY`、健康检查 URL、与主站 `LAB_SSO_SECRET` 共享约定。
- [ ] **Step 3:** Commit：`docs(lab): add spike gate checklist and VPS runbook`

**Gate:** 人工在 VPS 上跑通前，主站可先做 Task 1–4；**不得合并「声称端到端可用」的功能开关默认打开。**

---

### Task 1: Schema — `lab_sessions` + `lab_config`

**Files:**
- Create: `supabase/migrations/20260724140000_lab_research.sql`

- [ ] **Step 1:** 编写迁移：建表、索引、`ENABLE ROW LEVEL SECURITY`、own-select/own-insert policies；service role 用于回调。
- [ ] **Step 2:** Seed `lab_config` key `active_model` = `{ "provider": "gemini", "model_id": "gemini-2.0-flash" }`（model_id 可在 Spike 后调整）。
- [ ] **Step 3:** Commit：`feat(lab): add lab_sessions and lab_config schema`

---

### Task 2: Membership `lab_access`

**Files:**
- Modify: `src/lib/membership/types.ts`
- Modify: `src/lib/membership/guard.ts`
- Modify: `src/lib/membership/v2.ts`（若有 `canUse*` helpers，对齐 T2+）

- [ ] **Step 1:** 扩展 `MembershipCapability` 与 `effective.labAccess`。
- [ ] **Step 2:** `capabilityAllowed` / v2 `ensureCurrentMembership`：`plan in (T2,T3) && status === 'active'`。
- [ ] **Step 3:** 用现有会员测试账号手工验证：T1 → 403，T2 → OK（可在后续 API 任务一起验）。
- [ ] **Step 4:** Commit：`feat(lab): gate lab_access to T2+`

---

### Task 3: Report schema + compliance filter

**Files:**
- Create: `src/lib/lab/report-schema.ts`
- Create: `src/lib/lab/compliance-filter.ts`
- Create: `src/lib/lab/compliance-filter.test.ts`（若仓库无 vitest/jest，则用 `node --test` 或最小断言脚本；优先跟现有测试习惯）

**Interfaces:**
- Produces: `parseLabDiagnoseReport(input: unknown): LabDiagnoseReport`
- Produces: `filterLabReport(report: LabDiagnoseReport): { ok: true, report } | { ok: false, reason }`

- [ ] **Step 1:** 定义 Zod schema：`riskThemes[]`, `sectorExposure[]`, `concentrationNotes[]`, `teachingQuestions[]`, `disclaimer`；禁止顶层 `symbols`/`orders`。
- [ ] **Step 2:** 实现规则过滤：买卖指令词、明显证券代码模式 → fail。
- [ ] **Step 3:** 单元测试：干净报告 pass；含「买入 600000」fail。
- [ ] **Step 4:** Commit：`feat(lab): add de-tickerized report schema and compliance filter`

---

### Task 4: SSO auth-code issue + exchange

**Files:**
- Create: `src/lib/lab/sso.ts`
- Create: `src/app/api/lab/sso/route.ts`
- Create: `src/app/api/lab/sso/exchange/route.ts`

**Interfaces:**
- `POST /api/lab/sso` → `{ success, code, expiresIn, labBaseUrl }`（需登录 + `lab_access`）
- `POST /api/lab/sso/exchange` → `{ success, sessionToken, expiresIn }`（需 `Authorization: Bearer LAB_DOJO_SERVER_KEY` + body `{ code }`）

- [x] **Step 1:** `issueLabAuthCode(userId)`：jose 签名，`exp` 60s，`jti` 唯一；消费表或 KV（可用 Supabase `lab_sso_codes` 单次删除）。
- [x] **Step 2:** `exchangeLabAuthCode(code)`：验证签名 + 单次消费，返回短 session JWT（建议 1h）。
- [x] **Step 3:** Issue 路由挂 `requireTradeUser` + `requireMembershipCapability(..., "lab_access")`。
- [x] **Step 4:** Exchange 路由校验服务端密钥（env `LAB_DOJO_SERVER_KEY`）。
- [ ] **Step 5:** Commit：`feat(lab): add auth-code SSO issue and exchange`

---

### Task 5: Session writeback + list API

**Files:**
- Create: `src/app/api/lab/session/route.ts`

- [ ] **Step 1:** `GET`：当前用户最近 N 条 `lab_sessions`。
- [ ] **Step 2:** `POST`：Dojo 回调；校验服务端密钥；body 过 `parseLabDiagnoseReport` + `filterLabReport`；写入 `lab_sessions`（含 provider/model/tokens/cost）。
- [ ] **Step 3:** 失败返回 422 + reason，不落库脏数据。
- [ ] **Step 4:** Commit：`feat(lab): add lab session list and writeback API`

---

### Task 6: `/lab` entry page + nav + i18n

**Files:**
- Create: `src/app/[locale]/(dashboard)/lab/page.tsx`
- Create: `src/components/lab/LabEntryClient.tsx`
- Modify: nav component（定位现有站点导航入口，并列「T0 训练盘 / AI 实验室」）
- Modify: `src/middleware.ts` — 将 `/lab` 加入 `PROTECTED_PATHS`（若适用）
- Modify: `messages/zh.json`, `zh-TW.json`, `en.json`

- [ ] **Step 1:** 入口页：全局叙事摘要、本入口做什么/不做什么、跳转 T0、历史诊断列表、「进入实验室」按钮。
- [ ] **Step 2:** 按钮：`POST /api/lab/sso` → `window.location = labBaseUrl + '/sso/callback?code=' + code`。
- [ ] **Step 3:** 非 T2+：隐藏进入按钮，显示升级会员 CTA。
- [ ] **Step 4:** Commit：`feat(lab): add lab entry page, nav, and copy`

---

### Task 7: Admin model switch

**Files:**
- Create: `src/app/api/admin/lab-config/route.ts`
- Create: `src/app/api/admin/lab-models/route.ts`
- Create: `src/components/admin/AdminLabConfigPanel.tsx`
- Create: `src/app/cjkzt/(protected)/lab/page.tsx`
- Modify: `src/components/admin/AdminShell.tsx` — nav item「AI 实验室」

- [ ] **Step 1:** `GET /api/admin/lab-models` 代理 Dojo `/health/models`（返回各 provider：configured / visionCapable）。
- [ ] **Step 2:** `PUT /api/admin/lab-config` 仅允许切换到 `visionCapable && configured` 的选项。
- [ ] **Step 3:** Admin UI：显示 Gemini / GLM 状态；保存成功 toast。
- [ ] **Step 4:** Commit：`feat(lab): admin model provider switch with health gate`

---

### Task 8: Dojo VPS adapter (out-of-repo checklist)

**Files:**
- Update: `docs/lab/dojo-vps-runbook.md` with exact env names after Spike

- [ ] **Step 1:** 部署锁定版本 DojoAgents；配置 `GEMINI_API_KEY`。
- [ ] **Step 2:** 实现 `/sso/callback` + exchange；HttpOnly cookie。
- [ ] **Step 3:** 诊断完成后 `POST` 主站 `/api/lab/session`；拉取主站 `lab_config` 决定 provider。
- [ ] **Step 4:** `/health/models`：检查 Gemini/GLM 密钥与 vision 能力。
- [ ] **Step 5:** 记录 Spike 结果到 `docs/lab/spike-checklist.md`；若失败则文档化 fallback。

---

### Task 9: P0 acceptance

主站无 VPS 验收见 [`docs/lab/main-site-acceptance.md`](../../lab/main-site-acceptance.md)。

- [ ] 迁移已应用（`lab_sessions` / `lab_config` / `lab_sso_codes`）
- [ ] `LAB_SSO_SECRET` / `LAB_DOJO_SERVER_KEY` 已配置
- [ ] T2+ SSO 签发成功；T1 被拦截
- [ ] Session 合规回写 + `/lab` 历史可见
- [ ] 后台 `/cjkzt/lab` 健康检查与门禁正常
- [ ] （VPS 后）T2+ 端到端：进实验室 → 上传截图 → 主站历史出现去标的化报告
- [ ] Commit / release note：`feat(lab): P0 portfolio diagnose lab`

---

## Execution order

`Task 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7`（主站可并行于 Spike）  
`Task 8`（VPS）与 Spike 绑定  
`Task 9` 收口

## After P0 (do not start now)

模块考核仪表盘（T0 + 量化实验室、TQ、点击给「从哪开始 / 加强哪项」）已记下，**等本计划 Task 9 完成后再另写 plan**。见 [`docs/superpowers/specs/2026-08-20-module-assessment-dashboard-design.md`](../specs/2026-08-20-module-assessment-dashboard-design.md)。

## Fallback

若 Spike Gate 失败：保留主站 Task 1–7 接口形状，将 Dojo 替换为自研 `lab-worker`（同 VPS 或 Workers AI），Gemini 直连；更新 runbook，不重做会员与合规层。
