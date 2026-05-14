# 指令93 联调验收清单

本文用于验证以下功能链路是否符合预期：
- 会员体系（T0-T3）
- Stripe 订阅支付与 Webhook 同步
- 积分系统
- 推荐激励
- TQ 报告与建议
- 课程 CPS 导流追踪
- 后台管理（`/cjkzt`）

---

## 0. 前置检查

- 已执行 Supabase 迁移：
  - `20260501093000_instruction93_membership_growth.sql`
  - `20260501094000_instruction93_membership_cron.sql`
- 已配置环境变量（见 `docs/stripe-webhook-联调与上线配置.md`）
- 本地可正常启动：`npm run dev`
- 已有至少两个测试账号（A 推荐人 / B 被推荐人）

---

## 1. 注册与试用（T0_trial）

### 目标
- 新用户自动获得 14 天 `T0_trial`
- 个人资料页可展示会员信息

### 验收步骤
1. 新注册账号 B（可通过 `register` 页面）
2. 访问 `GET /api/membership/current`
3. 打开 `/my-profile`、`/membership`

### 预期结果
- `plan = T0_trial`
- `status = trialing`
- `trialDaysLeft > 0`
- 页面显示试用状态和升级入口

---

## 2. 试用到期锁定

### 目标
- 试用到期后锁定模拟交易和 TQ 写入能力
- 历史数据可读

### 验收步骤
1. 将测试账号 B 的 `user_memberships.trial_end` 手动改为过去时间
2. 访问交易页 `/trade`
3. 调用交易相关 API（如下单）

### 预期结果
- 接口返回 `402` 或明确升级提示（`TRIAL_EXPIRED`）
- 页面提示“试用已结束，请升级”
- 历史成绩仍可查看

---

## 3. Stripe 订阅与取消

### 目标
- 月/年订阅可发起支付并回写会员
- 取消订阅仅周期末生效

### 验收步骤
1. 账号 B 打开 `/membership`
2. 选择 T1/T2/T3（分别验证月付、年付）
3. 完成 Stripe Checkout 支付
4. 检查 `user_memberships` 与 `payments`
5. 点击取消订阅

### 预期结果
- 支付成功后：
  - `user_memberships.plan` 正确
  - `status = active`
  - `stripe_subscription_id` 已写入
  - `payments` 有交易记录，`status = paid`
- 取消后：
  - `cancel_at_period_end = true`
  - 不立即降级

---

## 4. Webhook 幂等与状态同步

### 目标
- `invoice.paid`、`invoice.payment_failed`、`customer.subscription.deleted` 等事件正常处理
- 重放事件不会重复发权益

### 验收步骤
1. 使用 Stripe CLI 转发 webhook 到本地
2. 触发 `invoice.paid`、`invoice.payment_failed`、`customer.subscription.deleted`
3. 重复发送同一事件（重放）
4. 检查 `webhook_events`

### 预期结果
- 同一 `event_id` 仅处理一次
- `webhook_events` 去重成功
- 会员状态与支付状态按事件更新

---

## 5. 积分系统

### 目标
- 余额、赚取、兑换、流水一致
- 兑换后生成兑换码

### 验收步骤
1. 打开 `/points`
2. 调 `POST /api/points/earn` 触发：
   - `daily_login`
   - `sim_trade_completed`（验证每日上限）
3. 调 `POST /api/points/redeem` 兑换奖励
4. 查询 `GET /api/points/balance`

### 预期结果
- `user_points.balance/total_earned/total_spent` 正确变更
- `points_transactions` 记录完整
- `redemptions` 有可用兑换码
- 页面底部显示合规声明

---

## 6. 推荐激励

### 目标
- 邀请码可生成、注册可绑定、首付可发奖励

### 验收步骤
1. 账号 A 获取邀请码：`GET /api/referral/generate-code`
2. 账号 B 使用 `?ref=CODE` 注册
3. 账号 B 首次完成订阅支付
4. 查询：
   - `referrals`
   - A 的 `user_memberships` 与积分
   - B 的折扣券（`redemptions`）

### 预期结果
- 注册后：`status = completed_auth`
- 首付后：`status = completed_payment` 且 `reward_granted = true`
- A 获得会期奖励 + 积分奖励
- B 获得首月折扣券记录

---

## 7. TQ 报告与建议

### 目标
- T2/T3 可下载 PDF 深度报告
- 建议接口可返回模板化建议

### 验收步骤
1. T2/T3 用户访问 `/my-profile`
2. 点击“下载 TQ 深度报告”
3. 调 `GET /api/tq/advice`
4. 调 `GET /api/tq/report?format=pdf`

### 预期结果
- 非 T2/T3 被拒绝
- T2/T3 可正常下载 PDF
- 建议内容包含命中模板与课程提示

---

## 8. CPS 导流追踪

### 目标
- 点击课程链接可记录，转化回调可结算并发积分

### 验收步骤
1. 调 `POST /api/course/click` 获取 `clickId`
2. 用 `clickId` 调 `POST /api/course/convert`
3. 检查 `course_clicks` 和积分余额

### 预期结果
- `course_clicks.conversion_status = converted`
- `commission_amount` 写入
- 用户获得 1:1 消费积分（向下取整）

---

## 9. 后台管理（/cjkzt）

### 目标
- 会员、积分、推荐、支付记录可查看
- 积分调整可生效

### 验收步骤
1. 打开后台菜单：
   - `/cjkzt/membership`
   - `/cjkzt/points`
   - `/cjkzt/referrals`
   - `/cjkzt/billing`
2. 提交一次积分调整
3. 刷新列表核对数据

### 预期结果
- 页面可正常加载并展示数据
- 调整后积分即时更新

---

## 10. 定时任务

### 目标
- 每日任务可自动更新会员状态

### 验收步骤
1. 确认 `cron.job` 中存在：
   - `instruction93-expire-memberships`
   - `instruction93-expire-trials`
2. 手动执行函数：
   - `SELECT public.instruction93_expire_memberships();`
   - `SELECT public.instruction93_expire_trials();`

### 预期结果
- 过期会员被置为 `expired`
- 试用到期用户由 `T0_trial` 转为 `T0_paid`

---

## 11. 安全项验收

- Stripe Webhook 验签必须开启
- 关键 POST 接口通过同源检查（CSRF 防护）
- 敏感字段（如 `stripe_subscription_id`）不在用户公开接口直接暴露
- TQ 报告仅本人可下载（后台管理员除外）

---

## 12. 回归建议

- 回归交易基础功能（下单、持仓、委托、成交）
- 回归现有 TQ 评分与证书功能
- 回归后台已有模块（学员、课程、收费通知）确认未回归受损
