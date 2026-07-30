# Phase 2 海外切域 — 部署后人工步骤

**Spec:** [`docs/superpowers/specs/2026-07-30-phase2-overseas-domain-cutover.md`](../docs/superpowers/specs/2026-07-30-phase2-overseas-domain-cutover.md)

## 已自动完成（本分支 / MCP）

- [x] `wrangler.jsonc` → `NEXT_PUBLIC_APP_URL=https://leolearnstotrade.com`
- [x] CI build 注入 `NEXT_PUBLIC_APP_URL`
- [x] GitHub Variables：`TQ_CRON_BASE_URL`、`NEXT_PUBLIC_APP_URL`
- [x] Stripe 新 webhook：`https://leolearnstotrade.com/api/membership/webhook/stripe`（`we_1TyvBf35N2e3I4kY6PTmYedP`）

## 合并 main 部署后

### 1. Stripe Worker Secret

新 webhook endpoint 有**独立** signing secret（与 `tradelovin.com` endpoint 不同）。

在 Cloudflare Worker Secrets 更新：

```bash
npx wrangler secret put STRIPE_WEBHOOK_SECRET
# 粘贴 Stripe Dashboard → Webhooks → leolearnstotrade endpoint → Signing secret
```

验证：Stripe Dashboard → 新 endpoint → **Send test webhook** → 应 200。

稳定后可 **Disable** 旧 `tradelovin.com` endpoint（`we_1TWtKz35N2e3I4kYxtic23Ut`）。

### 2. Supabase Dashboard（项目 `tradelovin` / `bpuqqyqmrtchaqfouygm`）

Authentication → URL Configuration：

| 项 | 值 |
|----|-----|
| Site URL | `https://leolearnstotrade.com` |
| Redirect URLs | 必须保留 `https://xeoaxis.com/**`；添加 `https://leolearnstotrade.com/**`；308 前可保留 `https://tradelovin.com/**` |

### 3. 部署验证

```bash
BASE_URL=https://leolearnstotrade.com node scripts/deploy/verify-release.mjs
BASE_URL=https://xeoaxis.com npm run smoke:xeoaxis
```

### 4. 最后：开启 legacy 308

**仅当 1–3 全部通过后：**

```bash
npx wrangler deploy --config wrangler.jsonc \
  --var "ENABLE_LEGACY_OVERSEAS_REDIRECT:1" \
  # …其余 deploy vars 同 CI
```

或 Cloudflare Dashboard → Worker `tradelovin` → Variables → `ENABLE_LEGACY_OVERSEAS_REDIRECT=1`

验证：

```bash
curl -sI https://tradelovin.com/ | grep -i location
# 期望：308 → https://leolearnstotrade.com/
BASE_URL=https://xeoaxis.com npm run smoke:xeoaxis
```

## 回滚

见 spec §4。
