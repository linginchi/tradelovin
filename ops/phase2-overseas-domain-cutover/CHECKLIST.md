# Phase 2 海外切域 — 部署后人工步骤

**Spec:** [`docs/superpowers/specs/2026-07-30-phase2-overseas-domain-cutover.md`](../docs/superpowers/specs/2026-07-30-phase2-overseas-domain-cutover.md)

## 已自动完成（本分支 / MCP）

- [x] `wrangler.jsonc` → `NEXT_PUBLIC_APP_URL=https://leolearnstotrade.com`
- [x] CI build 注入 `NEXT_PUBLIC_APP_URL`
- [x] GitHub Variables：`TQ_CRON_BASE_URL`、`NEXT_PUBLIC_APP_URL`
- [x] Stripe 新 webhook：`https://leolearnstotrade.com/api/membership/webhook/stripe`（`we_1TyvBf35N2e3I4kY6PTmYedP`）
- [x] PR #9 已合并并部署
- [x] Worker `STRIPE_WEBHOOK_SECRET` 已更新为新 endpoint
- [x] 旧 `tradelovin.com` Stripe webhook 已 **disabled**
- [x] PR #10 已合并：开启 `ENABLE_LEGACY_OVERSEAS_REDIRECT=1`
- [x] 验证：`tradelovin.com` → 308 → `leolearnstotrade.com`；`xeoaxis.com` smoke 绿

## 合并 main 部署后

### 1. Stripe Worker Secret

- [x] 已完成（2026-07-30）

### 2. Supabase Dashboard（项目 `tradelovin` / `bpuqqyqmrtchaqfouygm`）

**⚠️ 强烈建议尽快改（Google OAuth Site URL）。** 代码侧已加 legacy→canonical session handoff，但 Dashboard 仍应改为：

| 项 | 值 |
|----|-----|
| Site URL | `https://leolearnstotrade.com` |
| Redirect URLs | 必须保留 `https://xeoaxis.com/**`；添加 `https://leolearnstotrade.com/**`；308 前可保留 `https://tradelovin.com/**` |

### 3. 部署验证

- [x] release fingerprint（`leolearnstotrade.com`）通过
- [x] `smoke:xeoaxis` 通过

### 4. 最后：开启 legacy 308

- [x] 已完成（PR #10）；`tradelovin.com` → 308 → `leolearnstotrade.com`

## 回滚

见 spec §4。
