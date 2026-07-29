# Design: 内地入口 xeoaxis 固化护栏（Phase 2 海外切域期间）

**日期：** 2026-07-29  
**状态：** 待实现  
**范围：** 在海外主域从 `tradelovin.com` 迁到 `leolearnstotrade.com` 的同时，用工程护栏保护已恢复正常的内地入口 `xeoaxis.com`，并保留短路径恢复手段。  
**非目标：** 不为内地拆独立 Worker；不做渐进金丝雀分流；不自动 `wrangler rollback`。

---

## 背景

生产为**多入口共用同一 Cloudflare Worker**：

```text
leolearnstotrade.com (海外主域，Phase 2 目标)
tradelovin.com       (海外旧域，将 308 → 主域)
xeoaxis.com          (内地 Aliyun 反代入口，一等公民)
         └─→ 同一 Worker → Supabase
```

已知曾打挂 `xeoaxis` 的路径：

1. `NEXT_ASSET_PREFIX` 指向 `*.workers.dev` 或绝对站点域 → 内地 CSS/JS 直连 Cloudflare 失败，页面裸 HTML。
2. `MAGIC_LINK_ORIGIN` / 默认 fallback 钉死海外主域 → 内地用户收到打不开的登录链。
3. middleware 把非旧海外域（含 xeoaxis）一并 308 到海外主域。
4. Supabase Redirect URLs 只保留海外域、去掉 xeoaxis。

Lab WIP 已演示风险 2；`tradelovin-dev` 分支 `codex/hotfix-xeoaxis-magic-link-origin-20260728` 含按请求 Host 解析魔法链接的修复，应并入本方案实现。

---

## 决策摘要

采用**方案 1**：契约测试 + Cursor/Agent rule + CI 双入口冒烟 + 人工恢复 Runbook（`wrangler rollback` 为代码回归止血手段）。

用户确认：护栏优先（选项 A），并保留「一旦伤到能方便恢复」的途径；不采用独立 Worker（B）或仅文档约定（C）；暂不上「已知健康锚点」或金丝雀（方案 2/3）。

---

## §1 多入口模型

不改部署拓扑；继续共用同一 Worker。

| 角色 | 主机名 | 行为 |
|------|--------|------|
| 海外主域 | `leolearnstotrade.com`、`www.leolearnstotrade.com` | 规范入口；外部服务与文档逐步指向此处 |
| 海外旧域 | `tradelovin.com`、`www.tradelovin.com` | 仅 308 → 海外主域（保留 path + query） |
| 内地入口 | `xeoaxis.com`、`www.xeoaxis.com` | **永不** 308 到海外；静态资源同源相对路径；魔法链接留在本域；浏览器 Supabase 走 `/supabase-proxy` |

单一模块 `src/lib/site-entries.mjs`（及 `site-entries.mjs.d.ts`）导出：

- 入口清单与角色（`canonical` / `legacy_redirect` / `mainland`）
- `isMainlandEntryHost(hostname)`
- `isLegacyOverseasHost(hostname)`（仅旧海外域）
- `getCanonicalOverseasHostname()`
- 魔法链接 allowlist（至少含上表全部主机）

middleware、magic-link origin、supabase browser client、DEPLOY/ops 文档与契约测试**只引用该模块**，禁止再散落硬编码主机名（文案邮箱如 `noreply@tradelovin.com` 属品牌发信，不在本模块强制改写范围内）。

Phase 2 海外切域只改「海外主/旧」相关绑定与 env；**内地入口行视为冻结契约**，任何改动必须附带契约测试更新且显式评审。

---

## §2 护栏

### 2.1 契约测试（PR 必过）

至少覆盖：

| ID | 不变量 |
|----|--------|
| T1 | `resolveAssetPrefix`：空 → 无 assetPrefix；任何绝对 `http(s)://` 前缀（含 `*.workers.dev` 与任一站点域）在多入口架构下一律忽略并告警，强制回退相对路径 |
| T2 | 魔法链接：请求 Origin/X-Forwarded-Host/`Host` 为 xeoaxis 时，即使 env 为 `https://leolearnstotrade.com`，base URL 仍为 xeoaxis |
| T3 | middleware：仅 legacy 海外域 308 到主域；**xeoaxis 请求不得产生跨域 Location 到海外主域** |
| T4 | `site-entries`：xeoaxis 存在且角色为 `mainland`；不在 `legacy_redirect` 列表 |

现有 `tests/lib/auth/magic-link-origin.contract.test.mjs`（hotfix 分支）并入并扩展至 T3/T4。

### 2.2 Cursor / Agent rule

新增 `.cursor/rules/multi-entry-xeoaxis.mdc`（always apply 或 globs 覆盖 middleware / auth / next.config / deploy）：

- 改域名、origin、assetPrefix、登录回跳、middleware host 时必须跑上述契约。
- 禁止：用单一 `APP_ORIGIN`/`MAGIC_LINK_ORIGIN` **覆盖**所有入口的请求 Host；禁止把 xeoaxis 写入「旧域跳转列表」。
- 部署文档必须保持「双/三入口下 `NEXT_ASSET_PREFIX` 留空」。

### 2.3 CI

- **PR / push：** 跑 T1–T4（挂入现有测试命令或 OpenNext workflow 前置步骤）。
- **main 部署成功且 fingerprint 之后：** 对 `https://xeoaxis.com` 跑轻量冒烟（新脚本，建议 `scripts/deploy/xeoaxis-entry-smoke.mjs`，`npm run smoke:xeoaxis`）。

冒烟（无登录态）：

1. `GET /` → 200；若有 `Location`，**不得**指向 `leolearnstotrade.com` 或 `tradelovin.com`。
2. HTML 中 `/_next/static` 引用为相对路径或 `xeoaxis.com` 同域；不得出现 `workers.dev` 或海外绝对 asset 前缀。
3. 抽取至少一个 static URL → HTTP 200。

冒烟失败：workflow 标红，日志提示打开 `ops/mainland-access/XEOAXIS_RECOVERY.md`；**不**自动 rollback。

海外主域现有 `verify-release`（`TQ_CRON_BASE_URL`）保留；Phase 2 完成后该变量应改为 `https://leolearnstotrade.com`，与 xeoaxis 冒烟独立。

---

## §3 恢复途径

文档：`ops/mainland-access/XEOAXIS_RECOVERY.md`；`DEPLOY.md` §9 增加链接。

原则：先区分**环境变量误配** vs **代码回归**，再选最短动作。

### A. 自检（约 5 分钟）

```bash
./ops/mainland-access/verify-mainland-proxy.sh xeoaxis.com <worker-host>
BASE_URL=https://xeoaxis.com npm run smoke:xeoaxis
```

症状对照：

| 症状 | 优先查 |
|------|--------|
| 页面无样式 / 裸 HTML | `NEXT_ASSET_PREFIX`、构建产物 asset 前缀 |
| 登录邮件链到海外域 | magic-link 解析逻辑、是否未部署 Host 优先修复 |
| 打开 xeoaxis 整站跳海外 | middleware 旧域列表是否误含 xeoaxis |
| 登录/OAuth 回调失败 | Supabase Redirect URLs 是否仍含 xeoaxis |

### B. 环境变量类（不回滚代码）

- Actions Variable / 构建：`NEXT_ASSET_PREFIX` **清空**。
- `MAGIC_LINK_ORIGIN` / `APP_ORIGIN` 可设为海外主域（供非 allowlist Host 回退）；**不得**依赖其覆盖 xeoaxis 请求——代码必须 Host 优先。
- Supabase Dashboard：Redirect URLs **保留** `https://xeoaxis.com/**` 与既有 callback 路径。
- 改完后重跑冒烟；若仅构建期变量变更，触发一次生产构建部署。

### C. 代码回归类（线上止血）

```bash
npx wrangler rollback --message "xeoaxis: restore previous Worker version"
# 或：npx wrangler rollback <VERSION_ID> --message "..."
```

说明：三入口共 Worker，回滚会使海外入口一并回到该版本——这是刻意的止血。修根因用 PR 前进，勿长期停在 rollback 版本上开发。

Cloudflare 允许回滚至近 100 个已发布版本；bindings 被删改时 rollback 可能被拒，此时按 B 修 env 或 cherry-pick 热修前进部署。

### D. 恢复后

- 再跑 `smoke:xeoaxis` 与海外主域 fingerprint/冒烟。
- 记录根因；若缺不变量覆盖，补一条契约测试后合入。

---

## 与 Phase 2 海外切域的关系

本设计是切域的**前置护栏**，不是切域本身的全部清单。切域实现（middleware legacy 跳转、Cloudflare 自定义域、Supabase/Stripe/cron URL、文档）必须遵守 §1–§2；合入顺序建议：

1. 落地 `site-entries` + 魔法链接 Host 优先 + 契约测试 + rule + 冒烟/Runbook（本设计）。
2. 再合海外主域切换与 `tradelovin.com` 308（在护栏已绿的前提下）。

---

## 验收标准

- [ ] `site-entries` 为唯一主机名事实源；xeoaxis 角色为 `mainland`。
- [ ] T1–T4 在 CI 中失败即阻断合入。
- [ ] main 部署后 xeoaxis 冒烟步骤存在；失败有恢复文档链接。
- [ ] `XEOAXIS_RECOVERY.md` 含 A–D；`DEPLOY.md` 已链接。
- [ ] 模拟：`MAGIC_LINK_ORIGIN=https://leolearnstotrade.com` + xeoaxis Origin → 链接仍为 xeoaxis。
- [ ] 模拟：legacy 海外域 308 到主域；xeoaxis 首页不 308 出海。

---

## 参考

- `DEPLOY.md` §6（assetPrefix）、§9（内地入口）
- `next.config.ts` → `resolveAssetPrefix`
- `src/lib/supabase/client.ts`（xeoaxis → `/supabase-proxy`）
- 分支 `codex/hotfix-xeoaxis-magic-link-origin-20260728`
- Cloudflare Workers rollback：`npx wrangler rollback`
