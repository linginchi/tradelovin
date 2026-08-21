# Handoff：Mac → Windows（量化和儀表工程）

**日期：** 2026-08-21  
**远程：** `https://github.com/linginchi/tradelovin.git`  
**分支：** `main`（对齐 `origin/main`）  
**Mac 工作区（写本文时）：** `/Users/linginchi/Projects/tradelovin`  
**生产：** https://leolearnstotrade.com · 内地入口 https://xeoaxis.com  
**Worker（本文写就前一次部署）：** `5023d7de-c126-46cf-910a-d9df56c03385`（`https://tradelovin.mark-377.workers.dev`）  
**Supabase：** `bpuqqyqmrtchaqfouygm`

本文给 **另一台 Windows** 接着干。打开仓库后先读这一份，再动手。

---

## 0. Windows 上怎么对齐代码

不要拷 Mac 工作目录。从 GitHub 拉与本文同一提交：

```powershell
git clone https://github.com/linginchi/tradelovin.git
cd tradelovin
git checkout main
git pull origin main
npm ci
```

密钥 **不进 git**。在 Windows 上自行准备 `.env.local` / `.dev.vars`（与 Mac 生产构建同一套：`NEXT_PUBLIC_SUPABASE_URL` 必须仍是 `https://bpuqqyqmrtchaqfouygm.supabase.co`）。可用 `npx wrangler login` 做部署认证。

部署前必读 [`DEPLOY.md`](../DEPLOY.md) **§2**：Windows 上若 `next dev` 占用 `.open-next`，先结束该进程，禁止在 `EBUSY` 时空转重试。命令：

```powershell
npm run deploy:cloudflare
```

日常生产向工作若你本机还有 `tradelovin-dev` 目录，以 **本仓库 `origin/main`** 为准；不要在脏 Lab 树上 force-checkout。

---

## 1. 上一会话已完成（不要重做）

| 项 | 状态 |
|----|------|
| T0 考核盘资源栏：教练批准申请 / 补库存 | 已上线（`f647d8f` 等） |
| 教练给**自己**加额度，不必绑定另一位教练 | **代码在本次 push**；SQL `20260820190000_coach_self_grant` **已应用到远程库** |
| Supabase 自定义域名 `auth.leolearnstotrade.com` | **已激活**（`5_services_reconfigured`）；CNAME 灰云 |
| Google 回调 | 已加 `https://auth.leolearnstotrade.com/auth/v1/callback`；旧 supabase.co 仍留 |
| 魔法链接 | **未改**；内地仍 `https://xeoaxis.com/auth/magic-link?token=...` |
| `NEXT_PUBLIC_SUPABASE_URL` | **禁止改成自定义域**（Cookie 名会变） |

契约：`npm run test:contracts:xeoaxis`。额度契约：`node --test tests/trade-v2/resources-quota.contract.test.mjs`。

---

## 2. 下一工程：量化和儀表工程

**先实验室 P0，后考核仪表盘。** 不要先做仪表 UI。

### 2.1 量化实验室 P0（进行中）

**Phase 0 进行中**，分支：`feat/quant-lab-phase-0`。不要在 `main` 上当作已收口。

主站已有：`/lab`、SSO、合规过滤、`lab_sessions` / `lab_config` / `lab_sso_codes`。提供商 **仅 volcano**（无 Gemini / GLM）。apply [`supabase/migrations/20260821041119_lab_volcano_provider.sql`](../supabase/migrations/20260821041119_lab_volcano_provider.sql) 后，`lab_config.active_model` 将变为 `{ "provider": "volcano", "model_id": "pending-spike" }`（远程在 apply 前可能仍是旧 gemini 值）。

**未完成：** 外部 Spike（VPS + 火山多模态截图诊断）。[`docs/lab/spike-protocol.md`](../lab/spike-protocol.md) Gate A–E 无 Pass。无 `LAB_PUBLIC_BASE_URL` 时 `npm run spike:lab:check` 应 fail closed。API 路径 TBD：Path A 方舟 `ARK_API_KEY` vs Path B 视觉智能 `VOLC_*`。

决策：走 Dojo VPS，或 plan Fallback（自研 lab-worker + **volcano** SDK，非 Gemini）。未过 Spike 不得宣称端到端可用。对外主名用 **AI量化实验室**。

提醒规则 `.cursor/rules/quant-dashboard-engineering.mdc` **已删除（工程已开工）**。

文档：

- Spec：[`docs/superpowers/specs/2026-07-24-ai-research-lab-design.md`](../superpowers/specs/2026-07-24-ai-research-lab-design.md)
- Plan：[`docs/superpowers/plans/2026-07-24-ai-research-lab.md`](../superpowers/plans/2026-07-24-ai-research-lab.md)
- 验收：[`docs/lab/main-site-acceptance.md`](../lab/main-site-acceptance.md)

### 2.2 模块考核仪表盘（实验室能出一份去标的化报告之后）

T0 与量化实验室各一块 TQ 仪表；点击给出「从哪开始 / 加强哪项」。复用 `tq_scores`、雷达、`/api/tq/advice`。

Spec：[`docs/superpowers/specs/2026-08-20-module-assessment-dashboard-design.md`](../superpowers/specs/2026-08-20-module-assessment-dashboard-design.md)（含 §9 开工顺序）

---

## 3. 硬约束（Windows 上同样生效）

- 不改 `NEXT_PUBLIC_SUPABASE_URL`。
- 不把 `auth.*` 加入魔法链接 allowlist。
- 不改 `src/lib/auth/magic-link-origin.mjs` 的 Host 优先。
- Redirect URLs 保留 `https://xeoaxis.com/**`。
- 火山密钥（`ARK_API_KEY` 或 `VOLC_ACCESS_KEY` + `VOLC_SECRET_KEY`）以及 Dojo 密钥 **只放 VPS**，不进 `lab_config`、不进 git。主站不要配置 Gemini / GLM key。
- 用户可见实验室报告必须去标的化，禁止买卖指令。

Auth 自定义域排障：[`ops/mainland-access/XEOAXIS_RECOVERY.md`](../../ops/mainland-access/XEOAXIS_RECOVERY.md) §D。新子域 `ERR_NAME_NOT_RESOLVED` 多为本机/运营商负缓存，不是证书挂了。

---

## 4. 给 Windows Cursor 的开场指令（可粘贴）

> 先读 `docs/handoff-2026-08-21-windows-quant-dashboard.md`。当前任务是 **量化和儀表工程**：先完成量化实验室 P0（Spike 或 Fallback），再做 T0/实验室考核仪表盘。不要改魔法链接 origin，不要改 `NEXT_PUBLIC_SUPABASE_URL`。Windows 部署前读 `DEPLOY.md` §2，结束占用 `.open-next` 的 `next dev`。

---

**文档维护：** 实验室 Spike 有结论或仪表盘开工时更新本文件日期与 §2。
