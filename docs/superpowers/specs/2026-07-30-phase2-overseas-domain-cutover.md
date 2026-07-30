# Design: Phase 2 海外主域切到 leolearnstotrade.com

**日期：** 2026-07-30（修订）  
**状态：** 执行中  
**分支：** `phase2/overseas-domain-cutover`  
**前置：** xeoaxis 护栏已合 `main`（PR #7）；`leolearnstotrade.com` 线上已 200  

**非目标：** 不改内地入口；不拆 Worker；legacy 308 必须在 Stripe/Supabase/vars 迁移并重部署后再开。

---

## §1 多入口（冻结，见 `site-entries.mjs`）

| 角色 | 主机名 | Phase 2 |
|------|--------|---------|
| canonical | `leolearnstotrade.com` | 新主域；外部 URL 指向此处 |
| legacy_redirect | `tradelovin.com` | 迁移完成后 `ENABLE_LEGACY_OVERSEAS_REDIRECT=1` → 308 |
| mainland | `xeoaxis.com` | 不变；`smoke:xeoaxis` 必须持续绿 |

---

## §2 执行顺序

| 步 | 动作 | 负责 |
|----|------|------|
| 1 | 确认 `leolearnstotrade.com` HTTPS 200 | ✅ 已验证 |
| 2 | **仓库**：`NEXT_PUBLIC_APP_URL` → 新主域；CI build 注入同值 | 本 PR |
| 3 | **Stripe**：新增 webhook `https://leolearnstotrade.com/api/membership/webhook/stripe`（保留旧 endpoint） | Stripe MCP / Dashboard |
| 4 | **GitHub Variables**：`TQ_CRON_BASE_URL` → `https://leolearnstotrade.com` | `gh variable set` |
| 5 | **Supabase**（Dashboard）：Site URL → 新主域；Redirect URLs **保留** `https://xeoaxis.com/**` | 人工 |
| 6 | **合并 main → 自动部署** | CI |
| 7 | **验证**：主域 fingerprint + `smoke:xeoaxis` + Stripe test event | CI / 人工 |
| 8 | **最后**：Worker `ENABLE_LEGACY_OVERSEAS_REDIRECT=1`；验 `tradelovin.com` 308 | Wrangler / Dashboard |

---

## §3 验收

- [ ] Checkout `success_url` / `cancel_url` 含 `leolearnstotrade.com`
- [ ] 新 Stripe webhook 验签通过
- [ ] Supabase OAuth 在新主域可用；xeoaxis Redirect 仍在
- [ ] `TQ_CRON_BASE_URL` cron 成功
- [ ] legacy 308 开启后 xeoaxis 不跨域跳转

---

## §4 回滚

1. `ENABLE_LEGACY_OVERSEAS_REDIRECT=0`
2. `NEXT_PUBLIC_APP_URL` / `TQ_CRON_BASE_URL` 改回 `tradelovin.com` 并重部署
3. Stripe webhook 恢复以旧域为准
4. 代码：`npx wrangler rollback`（见 `XEOAXIS_RECOVERY.md`）
