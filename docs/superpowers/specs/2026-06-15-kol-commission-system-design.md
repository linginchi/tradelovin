# KOL/渠道分佣系统设计文档

## 概述

为交易豹（TradeLovin）增加 KOL/渠道分佣功能，让合作 KOL 通过专属邀请链接引入学员，学员付费后 KOL 获得 20% 学费分成。支持审计追踪、月结结算和自动化文案生成。

---

## 1. 数据模型

### 1.1 新建 `channel_partners` 表（KOL/渠道档案）

```sql
CREATE TABLE IF NOT EXISTS public.channel_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  channel_type TEXT NOT NULL DEFAULT 'kol' CHECK (channel_type IN ('kol', 'channel')),
  channel_name TEXT NOT NULL,
  channel_id TEXT,
  platform TEXT,
  commission_rate DECIMAL(5,4) NOT NULL DEFAULT 0.2000,
  contact_email TEXT,
  payout_info JSONB,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'terminated')),
  total_earned DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 1.2 新建 `commission_records` 表（分佣明细）

```sql
CREATE TABLE IF NOT EXISTS public.commission_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES channel_partners(id) ON DELETE CASCADE,
  referral_id UUID REFERENCES referrals(id) ON DELETE SET NULL,
  student_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_transaction_id UUID REFERENCES payment_transactions(id) ON DELETE SET NULL,
  tuition_amount DECIMAL(12,2) NOT NULL,
  commission_rate DECIMAL(5,4) NOT NULL,
  commission_amount DECIMAL(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'locked', 'paid', 'cancelled'
  )),
  settlement_month TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 1.3 新建 `commission_payouts` 表（月结汇总）

```sql
CREATE TABLE IF NOT EXISTS public.commission_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES channel_partners(id) ON DELETE CASCADE,
  settlement_month TEXT NOT NULL,
  total_commission DECIMAL(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'paid', 'cancelled'
  )),
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 1.4 扩展 `referrals` 表

```sql
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES channel_partners(id) ON DELETE SET NULL;
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS commission_paid DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.referrals DROP CONSTRAINT IF EXISTS referrals_status_check;
ALTER TABLE public.referrals ADD CONSTRAINT referrals_status_check CHECK (status IN (
  'pending', 'completed_auth', 'completed_payment', 'completed_commission'
));
```

---

## 2. 核心业务流程

### 2.1 KOL 入驻与追踪码生成

管理员在后台创建 `channel_partner` 记录 → 系统调用 `generateReferralCode()` 生成专属 referral code → `referrals` 行关联 `partner_id` → KOL 获得专属链接。

注册时的 `?ref=CODE` 逻辑与现有系统统一，`attachRefereeByCode()` 中额外填充 `partner_id`。

### 2.2 学员付款 → 分佣核算

Stripe Webhook 收到付款成功 → `recordPaymentTransaction()` 写入交易记录 → `settleReferralOnFirstPayment()` 发放积分/会期奖励 → **新增** `createCommissionRecord()` 检查 `referrals.partner_id`，若有则计算 `commission_amount = tuition × rate`，写入 `commission_records`（status: `pending`）。

### 2.3 退款保护期 → 锁定

每月 1 号 cron job（`lockCommissionRecords`）：查找 `status='pending'` 且已过 7 天保护期的记录。对应学员付款无退款 → `locked`；有退款 → `cancelled`。

### 2.4 月结出账 → 打款

每月 5 号 cron job（`settleMonthlyCommissions`）：按 partner 分组汇总 `locked` 记录，生成 `commission_payouts`（status: `pending`）。管理员在后台审核通过后标记 `approved`，实际打款后标记 `paid`。

---

## 3. API 路由

### 3.1 新增路由

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/channel-partner/my-profile` | GET | KOL 获取自己的档案与统计 |
| `/api/channel-partner/my-profile` | PUT | KOL 更新收款信息 |
| `/api/channel-partner/my-referrals` | GET | KOL 查看引入学员列表 |
| `/api/channel-partner/my-commissions` | GET | KOL 查看分佣明细与结算 |
| `/api/admin/channel-partners` | GET/POST | 管理员 KOL 列表/创建 |
| `/api/admin/channel-partners/[id]` | GET/PUT | 管理员查看/编辑 KOL |
| `/api/admin/channel-partners/[id]/referrals` | GET | 管理员查看 KOL 引入学员 |
| `/api/admin/channel-partners/[id]/commissions` | GET | 管理员查看 KOL 分佣明细 |
| `/api/admin/commission-payouts` | GET | 管理员查看月结汇总 |
| `/api/admin/commission-payouts/[id]/approve` | POST | 审核通过月结单 |
| `/api/admin/commission-payouts/[id]/pay` | POST | 标记已打款 |
| `/api/marketing/generate-copy` | POST | 生成推广文案 |

### 3.2 扩展现有路由

| 路由 | 变更 |
|------|------|
| `/api/referral/summary` | KOL 用户额外返回 partner 统计 |
| `/api/referral/register` | 关联 partner_id |
| `/api/admin/referrals/stats` | 新增分佣统计维度 |

---

## 4. 前端页面

### 4.1 KOL 看板（`/partner-dashboard`）

- 推广链接展示与复制/二维码下载
- 数据概览：本月预估佣金、累计已结算、引入学员数、待审核金额
- 引入学员列表（昵称、注册时间、付费状态、金额）
- 结算记录（月份、金额、状态）

### 4.2 管理员 KOL 管理（`/cjkzt/channel-partners`）

- KOL 列表（名称、平台、学员数、累计佣金、状态）
- 新建 KOL 表单
- KOL 详情页（学员明细 / 分佣记录 / 结算历史）

### 4.3 管理员月结管理（`/cjkzt/commission-payouts`）

- 月结单列表（KOL、佣金金额、状态、操作）
- 审核通过 / 标记打款
- 全局统计

### 4.4 扩展现有页面

- `/referral`：KOL 用户自动显示 KOL 看板内容
- `/cjkzt/referrals`：增加分佣统计模块

---

## 5. 文案钩子

### 5.1 模板类型

| 模板 | 用途 | 渠道 |
|------|------|------|
| `kol_recruit_email` | 招募 KOL | 邮件 |
| `kol_recruit_xiaohongshu` | 招募 KOL | 小红书 |
| `student_convert_email` | 转化学员 | 邮件 |
| `student_convert_xiaohongshu` | 转化学员 | 小红书 |

### 5.2 实现方式

TypeScript 模板函数（`src/lib/marketing/templates/`），变量插值渲染，不依赖 LLM API。最终文案经 humanizer-zh 规则润色，去除 AI 痕迹。

### 5.3 发放渠道

- **邮件**：通过 Resend 发送（现有基础设施）
- **小红书**：文案渲染后复制到剪贴板，KOL 自行粘贴发布
- **触发时机**：管理员创建 KOL 时（招募）、KOL 在看板点击生成（转化）、月结出账后（通知）

---

## 6. 定时任务

| 任务 | 触发 | 实现 |
|------|------|------|
| `lockCommissionRecords` | 每月 1 号 02:00 HKT | GitHub Actions → API |
| `settleMonthlyCommissions` | 每月 5 号 02:00 HKT | GitHub Actions → API |

与现有 TQ cron 模式一致（参考 `.github/workflows/`）。

---

## 7. 不做的事项

- 不直接对接小红书 API（未开放批量发帖）
- 不引入 LLM 生成文案（使用模板引擎 + humanizer 规则）
- 不修改现有 referral 积分/会期奖励逻辑（KOL 的现金分佣与之并行）
- 不涉及税务处理（管理员打款时自行处理）
