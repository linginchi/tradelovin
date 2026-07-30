# Phase 2 海外切域 Implementation Plan

**Spec:** `docs/superpowers/specs/2026-07-30-phase2-overseas-domain-cutover.md`

## Task 1: 仓库变量指向新主域

- [ ] `wrangler.jsonc`：`NEXT_PUBLIC_APP_URL` → `https://leolearnstotrade.com`
- [ ] `.github/workflows/opennext-build.yml`：build 步骤注入 `NEXT_PUBLIC_APP_URL: ${{ vars.NEXT_PUBLIC_APP_URL || 'https://leolearnstotrade.com' }}`
- [ ] `DEPLOY.md` §4：更新「leolearnstotrade 已绑定」；补充 Phase 2 切域 checklist
- [ ] `npm run test:contracts:xeoaxis`

## Task 2: Stripe webhook（MCP）

- [ ] `GetWebhookEndpoints` 盘点现有 endpoint
- [ ] 若无新主域 endpoint：`PostWebhookEndpoints` 创建（事件集与旧 endpoint 一致）
- [ ] 记录新 `whsec_`（若与旧不同，Worker Secret 需更新或双 endpoint 共用同一 secret 策略）

## Task 3: GitHub Variables

- [ ] `gh variable set TQ_CRON_BASE_URL --body https://leolearnstotrade.com`
- [ ] （可选）`gh variable set NEXT_PUBLIC_APP_URL --body https://leolearnstotrade.com`

## Task 4: Supabase Dashboard（人工）

- [ ] Authentication → URL Configuration：Site URL = `https://leolearnstotrade.com`
- [ ] Redirect URLs 保留：`https://xeoaxis.com/**`、`https://leolearnstotrade.com/**`、`https://tradelovin.com/**`（308 前）

## Task 5: 部署后验证

- [ ] main push → CI deploy + fingerprint + xeoaxis smoke
- [ ] Stripe Dashboard → Send test webhook 到新 endpoint

## Task 6: 开启 legacy 308（最后）

- [ ] `wrangler deploy --var ENABLE_LEGACY_OVERSEAS_REDIRECT:1` 或 Dashboard
- [ ] `curl -I https://tradelovin.com/` → 308 → leolearnstotrade
- [ ] `npm run smoke:xeoaxis`
