# 职员 Stripe 学费二维码

**Status:** Approved · 2026-08-28  
**Product:** 豹仔学堂 · 内地入口 `xeoaxis.com`

## 1. Problem

职员需要向内地学生收学费（跨境、一次性），并在微信里转发收款码。现有 Stripe 只服务会员订阅；`NEXT_PUBLIC_APP_URL` 指向海外主域，学生在内地打不开。学费成功后仍由职员在 `/cjkzt/fees` 手工标已付。

## 2. Goals

1. 职员打开 `https://xeoaxis.com/staff/pay`，输入共享职员密码后，填港币金额、学生姓名、备注，生成 PNG 二维码和可复制短链。
2. 二维码只编码 `https://xeoaxis.com/p/{token}`，不编码 `checkout.stripe.com`。
3. 学生扫码后：微信内先提示用系统浏览器；再跳 Stripe Checkout 一次性付款（动态支付方式，代码不写死 `payment_method_types`）。
4. `checkout.session.completed` 且 `metadata.kind === staff_tuition` 时只记 `payment_transactions`（`user_id` 可空）并标记链接已付，**不开通会员、不改报名**。

## 3. Non-Goals

- 自动改 `student_courses.payment_status`、开通 T1/T2/T3。
- 改会员订阅 Checkout，或把全局 `NEXT_PUBLIC_APP_URL` 改成 xeoaxis。
- 微信官方商户 / 境内直连。
- 固定学费档位、学员/课程绑定。

## 4. Data

表 `staff_pay_links`（仅 service_role 读写）：

- `token` 短、不可猜测（base64url ≥16）
- `amount_cents`、`currency`（hkd）
- `payer_name`、`note`
- `stripe_checkout_session_id`、`checkout_url`
- `status`：`open` / `paid` / `expired`
- `created_by`（固定为 `staff`，不记个人邮箱）
- `expires_at`（约 24h）

金额：HKD 4.00–200000.00，最多两位小数（Stripe 港币最低收款额）。

## 5. APIs

- `POST /api/staff/pay/login`：校验职员密码（`STAFF_PAY_PASSWORD`；非生产未配置时回退 `staffpay`），写入 httpOnly cookie。
- `POST /api/staff/pay`：职员 cookie + CSRF。创建 Checkout Session（`mode: payment`，`price_data`）。success/cancel/短链 origin **恒为** `https://xeoaxis.com`。
- `GET /api/staff/pay/{token}`：公开。返回状态与（未过期时）checkout URL。

Webhook 复用 `/api/membership/webhook/stripe`。

## 6. UX

- `/staff/pay`：独立页（无 AdminShell），本页输入职员密码即可，不走邮件确认或 `/cjkzt/login`。
- `/p/{token}`：公开落地。`?paid=1` 成功文案；`?canceled=1` 取消文案。
- `/cjkzt/fees`：入口链到 `/staff/pay`。
