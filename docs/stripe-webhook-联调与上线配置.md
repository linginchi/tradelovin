# Stripe Webhook 联调与上线配置

## 1. 必备环境变量

在本地与生产环境至少配置：

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_T1_MONTHLY`
- `STRIPE_PRICE_T1_YEARLY`
- `STRIPE_PRICE_T2_MONTHLY`
- `STRIPE_PRICE_T2_YEARLY`
- `STRIPE_PRICE_T3_MONTHLY`
- `STRIPE_PRICE_T3_YEARLY`
- `NEXT_PUBLIC_APP_URL`
- `INTERNAL_WEBHOOK_TOKEN`（内部回调接口保护）

---

## 2. 本地联调（Stripe CLI）

### 2.1 登录

```bash
stripe login
```

### 2.2 转发 Webhook 到本地接口

```bash
stripe listen --forward-to http://localhost:3000/api/membership/webhook/stripe
```

命令输出会包含一个 `whsec_...`，将其填入本地环境变量：

```bash
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

### 2.3 触发测试事件

```bash
stripe trigger checkout.session.completed
stripe trigger invoice.paid
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.deleted
```

---

## 3. 生产配置

1. 在 Stripe Dashboard 创建 webhook endpoint：  
   `https://your-domain.com/api/membership/webhook/stripe`
2. 勾选事件：
   - `checkout.session.completed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
3. 将 Dashboard 中 webhook signing secret 写入生产：
   - `STRIPE_WEBHOOK_SECRET=whsec_...`
4. 确认应用环境已配置全部 Price ID

---

## 4. Price ID 获取建议

在 Stripe Dashboard 中为每个计划建立 Product + Price：

- T1 月付 / 年付
- T2 月付 / 年付
- T3 月付 / 年付

将各自 Price ID 写入对应环境变量，避免在代码中硬编码。

---

## 5. 快速自检清单

- 发起订阅后跳转到 Stripe Checkout 成功
- 支付成功后 `user_memberships` 升级
- `payments` 有对应流水
- webhook 重放不会重复发放权益（`webhook_events` 去重）
- 取消订阅后 `cancel_at_period_end = true`
- 订阅删除事件后自动降级到 `T0_paid`

---

## 6. 常见问题

### Q1: `webhook signature verification failed`
- 检查 `STRIPE_WEBHOOK_SECRET` 是否与当前 endpoint 匹配
- 本地 `stripe listen` 每次重启可能生成新 secret

### Q2: 支付成功但会员未升级
- 先查 webhook 是否收到
- 再查 `webhook_events` 是否写入
- 查 `user_memberships` 是否已绑定 `stripe_subscription_id`

### Q3: 重复奖励发放
- 检查 `webhook_events(provider,event_id)` 唯一约束是否生效
- 检查 `referrals.reward_granted` 与首次支付幂等判断

---

## 7. PowerShell 示例（本地接口冒烟）

```powershell
Invoke-RestMethod -Method Get -Uri "http://localhost:3000/api/membership/current" -WebSession $session
```

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/points/earn" -WebSession $session -ContentType "application/json" -Body (@{
  reason = "daily_login"
} | ConvertTo-Json)
```

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/course/click" -WebSession $session -ContentType "application/json" -Body (@{
  courseUrl = "https://example.com/course/abc"
} | ConvertTo-Json)
```
