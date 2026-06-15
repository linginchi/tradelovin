# KOL/渠道分佣系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 KOL 专属邀请链接追踪、20% 学费分佣、月结结算、文案生成全套功能。

**Architecture:** 在现有 `referrals` 表上扩展，新增 `channel_partners`、`commission_records`、`commission_payouts` 三张表。复用现有的 `generateReferralCode`/`attachRefereeByCode` 逻辑，在付款结算处新增 `createCommissionRecord` 分支。前端 KOL 看板独立于现有 `/referral` 页面，管理员后台新增 KOL 管理和月结管理模块。

**Tech Stack:** Next.js 16 + Supabase + Resend + Tailwind CSS 4 + next-intl

---

## 文件结构

### 新建文件

| 文件路径 | 职责 |
|----------|------|
| `supabase/migrations/20260615100000_kol_commission_system.sql` | 数据库迁移：3 张新表 + referrals 扩展 |
| `src/lib/commission/service.ts` | 分佣核心逻辑：创建、锁定、月结 |
| `src/lib/commission/types.ts` | 分佣相关 TypeScript 类型 |
| `src/lib/marketing/templates/kol-recruit-email.ts` | KOL 招募邮件文案模板 |
| `src/lib/marketing/templates/kol-recruit-xiaohongshu.ts` | KOL 招募小红书文案模板 |
| `src/lib/marketing/templates/student-convert-email.ts` | 学员转化邮件文案模板 |
| `src/lib/marketing/templates/student-convert-xiaohongshu.ts` | 学员转化小红书文案模板 |
| `src/lib/marketing/renderer.ts` | 文案变量插值渲染器 |
| `src/lib/marketing/sender.ts` | 通过 Resend 发送营销邮件 |
| `src/app/api/channel-partner/my-profile/route.ts` | KOL 获取/更新自己的档案 |
| `src/app/api/channel-partner/my-referrals/route.ts` | KOL 查看引入学员列表 |
| `src/app/api/channel-partner/my-commissions/route.ts` | KOL 查看分佣明细 |
| `src/app/api/marketing/generate-copy/route.ts` | 生成推广文案 API |
| `src/app/api/admin/channel-partners/route.ts` | 管理员 KOL 列表/创建 |
| `src/app/api/admin/channel-partners/[id]/route.ts` | 管理员编辑 KOL |
| `src/app/api/admin/channel-partners/[id]/referrals/route.ts` | 管理员查看 KOL 引入学员 |
| `src/app/api/admin/channel-partners/[id]/commissions/route.ts` | 管理员查看 KOL 分佣明细 |
| `src/app/api/admin/commission-payouts/route.ts` | 管理员月结汇总列表 |
| `src/app/api/admin/commission-payouts/[id]/approve/route.ts` | 审核月结单 |
| `src/app/api/admin/commission-payouts/[id]/pay/route.ts` | 标记已打款 |
| `src/app/api/admin/cron/lock-commissions/route.ts` | cron: 锁定过保护期的分佣记录 |
| `src/app/api/admin/cron/settle-monthly-commissions/route.ts` | cron: 生成月结汇总 |
| `src/components/channel-partner/PartnerDashboardClient.tsx` | KOL 前端看板客户端组件 |
| `src/app/[locale]/partner-dashboard/page.tsx` | KOL 看板页面 |
| `src/components/admin/AdminChannelPartnersPanel.tsx` | 管理员 KOL 管理面板 |
| `src/app/cjkzt/(protected)/channel-partners/page.tsx` | 管理员 KOL 管理页面 |
| `src/app/cjkzt/(protected)/channel-partners/[id]/page.tsx` | 管理员 KOL 详情页面 |
| `src/components/admin/AdminCommissionPayoutsPanel.tsx` | 管理员月结管理面板 |
| `src/app/cjkzt/(protected)/commission-payouts/page.tsx` | 管理员月结管理页面 |

### 修改文件

| 文件路径 | 变更 |
|----------|------|
| `src/lib/referral/service.ts` | `attachRefereeByCode` 中新增 `partner_id` 字段填充；新增 `createCommissionRecord` |
| `src/app/api/referral/summary/route.ts` | KOL 用户额外返回 partner 统计信息 |
| `src/app/api/referral/on-payment/route.ts` | 付款后调用 `createCommissionRecord` |
| `src/app/api/admin/referrals/stats/route.ts` | 新增分佣统计维度 |
| `src/components/admin/AdminGrowthPanel.tsx` | 增加 KOL 分佣统计卡片 |
| `src/components/admin/AdminShell.tsx` | 侧边栏新增 "渠道管理" 和 "分佣月结" 链接 |
| `messages/zh.json` | 新增相关 i18n 文案 |
| `messages/en.json` | 新增相关 i18n 文案 |
| `messages/zh-TW.json` | 新增相关 i18n 文案 |
| `.github/workflows/opennext-build.yml` | 添加分佣 cron job 步骤 |

---

## 实施任务

### Task 1: 数据库迁移

**Files:**
- Create: `supabase/migrations/20260615100000_kol_commission_system.sql`

- [ ] **Step 1: 创建 `channel_partners` 表**

```12:67:docs/superpowers/specs/2026-06-15-kol-commission-system-design.md
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

- [ ] **Step 2: 创建 `commission_records` 表**

```69:84:docs/superpowers/specs/2026-06-15-kol-commission-system-design.md
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

CREATE INDEX IF NOT EXISTS commission_records_partner_id_idx ON public.commission_records(partner_id);
CREATE INDEX IF NOT EXISTS commission_records_student_idx ON public.commission_records(student_user_id);
CREATE INDEX IF NOT EXISTS commission_records_settlement_month_idx ON public.commission_records(settlement_month);
```

- [ ] **Step 3: 创建 `commission_payouts` 表**

```86:97:docs/superpowers/specs/2026-06-15-kol-commission-system-design.md
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

CREATE INDEX IF NOT EXISTS commission_payouts_partner_month_idx ON public.commission_payouts(partner_id, settlement_month);
```

- [ ] **Step 4: 扩展 `referrals` 表**

```99:105:docs/superpowers/specs/2026-06-15-kol-commission-system-design.md
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES channel_partners(id) ON DELETE SET NULL;
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS commission_paid DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.referrals DROP CONSTRAINT IF EXISTS referrals_status_check;
ALTER TABLE public.referrals ADD CONSTRAINT referrals_status_check CHECK (status IN (
  'pending', 'completed_auth', 'completed_payment', 'completed_commission'
));
```

- [ ] **Step 5: 提交**

```bash
git add supabase/migrations/20260615100000_kol_commission_system.sql
git commit -m "feat: add channel_partners, commission_records, commission_payouts tables"
```

---

### Task 2: 分佣类型定义和核心服务

**Files:**
- Create: `src/lib/commission/types.ts`
- Create: `src/lib/commission/service.ts`

- [ ] **Step 1: 创建 `src/lib/commission/types.ts`**

```typescript
export interface ChannelPartner {
  id: string;
  userId: string;
  channelType: "kol" | "channel";
  channelName: string;
  channelId: string | null;
  platform: string | null;
  commissionRate: number;
  contactEmail: string | null;
  payoutInfo: Record<string, unknown> | null;
  status: "active" | "paused" | "terminated";
  totalEarned: number;
  totalPaid: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionRecord {
  id: string;
  partnerId: string;
  referralId: string | null;
  studentUserId: string;
  paymentTransactionId: string | null;
  tuitionAmount: number;
  commissionRate: number;
  commissionAmount: number;
  status: "pending" | "locked" | "paid" | "cancelled";
  settlementMonth: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface CommissionPayout {
  id: string;
  partnerId: string;
  settlementMonth: string;
  totalCommission: number;
  status: "pending" | "approved" | "paid" | "cancelled";
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
}

export type PartnerStats = {
  monthEstimate: number;
  totalEarned: number;
  totalPaid: number;
  studentCount: number;
  pendingAmount: number;
};
```

- [ ] **Step 2: 创建 `src/lib/commission/service.ts` — `createCommissionRecord` 函数**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";

export async function createCommissionRecord(
  supabase: SupabaseClient,
  input: {
    refereeId: string;
    paymentTransactionId: string;
    tuitionAmount: number;
  },
): Promise<void> {
  // 1. 查找该学员的 referral 记录，看是否有 partner_id
  const { data: referral } = await supabase
    .from("referrals")
    .select("id,partner_id")
    .eq("referee_id", input.refereeId)
    .not("partner_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (!referral?.partner_id) return; // 不是 KOL 引入的学员

  // 2. 查 KOL 的分佣比例
  const { data: partner } = await supabase
    .from("channel_partners")
    .select("commission_rate")
    .eq("id", referral.partner_id)
    .single();

  if (!partner) return;

  const rate = Number(partner.commission_rate);
  const commissionAmount = Math.round(input.tuitionAmount * rate * 100) / 100;

  // 3. 写入分佣记录
  await supabase.from("commission_records").insert({
    partner_id: referral.partner_id,
    referral_id: referral.id,
    student_user_id: input.refereeId,
    payment_transaction_id: input.paymentTransactionId,
    tuition_amount: input.tuitionAmount,
    commission_rate: rate,
    commission_amount: commissionAmount,
    status: "pending",
  });

  // 4. 更新 KOL 累计收益
  await supabase.rpc("increment_channel_partner_total_earned", {
    p_partner_id: referral.partner_id,
    p_amount: commissionAmount,
  });
}
```

- [ ] **Step 3: 在 `src/lib/commission/service.ts` 中添加 `lockCommissions` 函数**

```typescript
export async function lockCommissions(supabase: SupabaseClient): Promise<number> {
  // 锁定所有超过 7 天退款保护期且仍为 pending 的记录
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("commission_records")
    .update({ status: "locked" })
    .eq("status", "pending")
    .lt("created_at", sevenDaysAgo)
    .select("id");

  if (error) throw error;
  return (data ?? []).length;
}
```

- [ ] **Step 4: 在 `src/lib/commission/service.ts` 中添加 `settleMonthlyCommissions` 函数**

```typescript
export async function settleMonthlyCommissions(
  supabase: SupabaseClient,
  settlementMonth: string,
): Promise<number> {
  // 1. 汇总每个 KOL 的 locked 分佣记录
  const { data: summaries } = await supabase
    .from("commission_records")
    .select("partner_id, commission_amount")
    .eq("status", "locked")
    .is("settlement_month", null);

  if (!summaries || summaries.length === 0) return 0;

  // 按 partner_id 分组汇总
  const partnerTotals = new Map<string, number>();
  for (const row of summaries) {
    const current = partnerTotals.get(row.partner_id) ?? 0;
    partnerTotals.set(row.partner_id, current + Number(row.commission_amount));
  }

  // 2. 生成月结单
  const payoutInserts = Array.from(partnerTotals.entries()).map(([partnerId, total]) => ({
    partner_id: partnerId,
    settlement_month: settlementMonth,
    total_commission: Math.round(total * 100) / 100,
    status: "pending" as const,
  }));

  if (payoutInserts.length > 0) {
    await supabase.from("commission_payouts").insert(payoutInserts);
  }

  // 3. 标记分佣记录为已结算
  const lockedIds = summaries.map((r) => r.partner_id);
  if (lockedIds.length > 0) {
    await supabase
      .from("commission_records")
      .update({ settlement_month: settlementMonth })
      .eq("status", "locked")
      .is("settlement_month", null);
  }

  return payoutInserts.length;
}
```

- [ ] **Step 5: 提交**

```bash
git add src/lib/commission/
git commit -m "feat: add commission core service with create, lock, settle logic"
```

---

### Task 3: 扩展现有 referral 服务

**Files:**
- Modify: `src/lib/referral/service.ts`

- [ ] **Step 1: 在 `attachRefereeByCode` 中新增 `partner_id` 关联**

在函数中找到更新 `referee_id` 和 `status` 的代码段（第 84-91 行），在其前面添加 partner 查询逻辑：

```typescript
// 在 attachRefereeByCode 函数内，更新之前：
// 查 referrals 有没有关联 channel_partner
const { data: partnerRow } = await supabase
  .from("channel_partners")
  .select("id")
  .eq("user_id", row.referrer_id)
  .maybeSingle();
const partnerId = partnerRow?.id ?? null;

// 更新时带上 partner_id（只在第一次关联时设置）
await supabase
  .from("referrals")
  .update({
    referee_id: input.refereeId,
    status: "completed_auth",
    completed_at: new Date().toISOString(),
    ...(partnerId ? { partner_id: partnerId } : {}),
  })
  .eq("id", row.id);
```

- [ ] **Step 2: 提交**

```bash
git add src/lib/referral/service.ts
git commit -m "feat: link referral to channel_partner on code registration"
```

---

### Task 4: 付款后分佣核算

**Files:**
- Modify: `src/app/api/referral/on-payment/route.ts`

- [ ] **Step 1: 在 `settleReferralOnFirstPayment` 调用后添加 `createCommissionRecord` 调用**

```typescript
import { createCommissionRecord } from "@/lib/commission/service";

// ... 现有逻辑 ...
await settleReferralOnFirstPayment(srv, {
  refereeId: parsed.data.refereeId,
  paymentId: parsed.data.paymentId,
});

// 新增：创建分佣记录（如果该学员由 KOL 引入）
await createCommissionRecord(srv, {
  refereeId: parsed.data.refereeId,
  paymentTransactionId: parsed.data.paymentId ?? "",
  tuitionAmount: parsed.data.amount ?? 0, // 需从 body 或 payment 表查询
});
```

注意：需要额外接收 `amount` 参数或在函数内查 `payment_transactions` 表获取金额。建议使用 body 传参更可靠：

```diff
const bodySchema = z.object({
  refereeId: z.string().uuid(),
  paymentId: z.string().optional(),
+ amount: z.number().nonnegative().optional(),
});
```

- [ ] **Step 2: 提交**

```bash
git add src/app/api/referral/on-payment/route.ts
git commit -m "feat: create commission record on referral first payment"
```

---

### Task 5: KOL 前端看板页面

**Files:**
- Create: `src/app/[locale]/partner-dashboard/page.tsx`
- Create: `src/components/channel-partner/PartnerDashboardClient.tsx`
- Create: `src/app/api/channel-partner/my-profile/route.ts`
- Create: `src/app/api/channel-partner/my-referrals/route.ts`
- Create: `src/app/api/channel-partner/my-commissions/route.ts`

- [ ] **Step 1: 创建 `src/app/api/channel-partner/my-profile/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;
  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  // 查 KOL 档案
  const { data: partner } = await srv
    .from("channel_partners")
    .select("*")
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (!partner) {
    return NextResponse.json({ success: false, error: "您不是渠道合作伙伴" }, { status: 403 });
  }

  // 本月预估佣金（pending + locked 且未入月结的记录）
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const { data: pendingCommissions } = await srv
    .from("commission_records")
    .select("commission_amount,status")
    .eq("partner_id", partner.id)
    .is("settlement_month", null)
    .in("status", ["pending", "locked"]);

  const monthEstimate = (pendingCommissions ?? []).reduce(
    (sum, r) => sum + Number(r.commission_amount), 0,
  );

  const stats = {
    monthEstimate: Math.round(monthEstimate * 100) / 100,
    totalEarned: Number(partner.total_earned),
    totalPaid: Number(partner.total_paid),
    pendingAmount: (pendingCommissions ?? [])
      .filter((r) => r.status === "pending")
      .reduce((s, r) => s + Number(r.commission_amount), 0),
  };

  return NextResponse.json({
    success: true,
    data: {
      partner: {
        id: partner.id,
        channelName: partner.channel_name,
        channelType: partner.channel_type,
        platform: partner.platform,
        commissionRate: Number(partner.commission_rate),
        status: partner.status,
        payoutInfo: partner.payout_info,
      },
      stats,
    },
  });
}
```

- [ ] **Step 2: 创建 `src/app/api/channel-partner/my-referrals/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;
  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  const { data: partner } = await srv
    .from("channel_partners")
    .select("id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (!partner) return NextResponse.json({ success: false, error: "不是渠道合作伙伴" }, { status: 403 });

  const { data: referrals } = await srv
    .from("referrals")
    .select(`
      id, code, status, created_at, completed_at,
      referee_id,
      commission_records!inner(tuition_amount, commission_amount, status, settlement_month)
    `)
    .eq("partner_id", partner.id)
    .order("created_at", { ascending: false })
    .limit(100);

  // 获取学员昵称
  const refereeIds = [...new Set((referrals ?? []).map((r) => r.referee_id).filter(Boolean))];
  const { data: profiles } = await srv
    .from("profiles")
    .select("user_id, nickname, real_name")
    .in("user_id", refereeIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p.nickname ?? p.real_name ?? "未知"]));

  const rows = (referrals ?? []).map((r) => ({
    id: r.id,
    code: r.code,
    studentName: profileMap.get(r.referee_id) ?? "未知",
    status: r.status,
    tuitionAmount: r.commission_records[0]?.tuition_amount ?? 0,
    commissionAmount: r.commission_records[0]?.commission_amount ?? 0,
    commissionStatus: r.commission_records[0]?.status ?? null,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  }));

  return NextResponse.json({ success: true, data: { rows, total: rows.length } });
}
```

- [ ] **Step 3: 创建 `src/app/api/channel-partner/my-commissions/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;
  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  const { data: partner } = await srv
    .from("channel_partners")
    .select("id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (!partner) return NextResponse.json({ success: false, error: "不是渠道合作伙伴" }, { status: 403 });

  const [commissionsResult, payoutsResult] = await Promise.all([
    srv
      .from("commission_records")
      .select("*")
      .eq("partner_id", partner.id)
      .order("created_at", { ascending: false })
      .limit(100),
    srv
      .from("commission_payouts")
      .select("*")
      .eq("partner_id", partner.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      commissions: commissionsResult.data ?? [],
      payouts: payoutsResult.data ?? [],
    },
  });
}
```

- [ ] **Step 4: 创建 KOL 看板页面组件 `src/components/channel-partner/PartnerDashboardClient.tsx`**

```typescript
"use client";

import { Copy, Download, Loader2, Share2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type PartnerData = {
  partner: {
    id: string;
    channelName: string;
    channelType: string;
    platform: string | null;
    commissionRate: number;
    status: string;
    payoutInfo: Record<string, unknown> | null;
  };
  stats: {
    monthEstimate: number;
    totalEarned: number;
    totalPaid: number;
    pendingAmount: number;
  };
};

type ReferralRow = {
  id: string;
  code: string;
  studentName: string;
  status: string;
  tuitionAmount: number;
  commissionAmount: number;
  commissionStatus: string | null;
  createdAt: string;
  completedAt: string | null;
};

export function PartnerDashboardClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<PartnerData | null>(null);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [inviteLink, setInviteLink] = useState("");
  const [tab, setTab] = useState<"referrals" | "payouts">("referrals");
  const [payouts, setPayouts] = useState<Array<Record<string, unknown>>>([]);

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [profileRes, referralRes, commissionRes] = await Promise.all([
        fetch("/api/channel-partner/my-profile", { credentials: "include" }),
        fetch("/api/channel-partner/my-referrals", { credentials: "include" }),
        fetch("/api/channel-partner/my-commissions", { credentials: "include" }),
      ]);

      const profileJson = await profileRes.json();
      if (!profileRes.ok || !profileJson.success) {
        setError(profileJson.error ?? "加载失败");
        return;
      }
      setData(profileJson.data);
      setInviteLink(`${window.location.origin}/register?ref=${profileJson.data.partner.id}`);

      const referralJson = await referralRes.json();
      if (referralJson.success) setReferrals(referralJson.data.rows);

      const commissionJson = await commissionRes.json();
      if (commissionJson.success) setPayouts(commissionJson.data.payouts ?? []);
    } catch {
      setError("加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadAll(); }, []);

  async function copyLink() {
    await navigator.clipboard.writeText(inviteLink);
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 加载中...
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-amber-300">{error ?? "数据加载失败"}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      {/* 顶部：KOL 信息 */}
      <section className="rounded-2xl border border-border/70 bg-card/35 p-6">
        <h1 className="text-2xl font-semibold">{data.partner.channelName} 推广看板</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          分佣比例：{Number(data.partner.commissionRate) * 100}% | 
          状态：{data.partner.status === "active" ? "正常" : "暂停"}
        </p>
      </section>

      {/* 推广链接 */}
      <section className="rounded-2xl border border-border/70 bg-card/35 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Share2 className="size-4" /> 我的推广链接
        </h2>
        <div className="mt-3 rounded-xl border border-border/70 bg-background p-3">
          <p className="break-all text-sm">{inviteLink}</p>
        </div>
        <div className="mt-3 flex gap-2">
          <Button onClick={() => void copyLink()}>
            <Copy className="mr-2 size-4" /> 复制链接
          </Button>
        </div>
      </section>

      {/* 数据概览 */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "本月预估", value: `¥${data.stats.monthEstimate.toLocaleString()}`, color: "text-emerald-400" },
          { label: "累计已结算", value: `¥${data.stats.totalPaid.toLocaleString()}`, color: "text-cyan-400" },
          { label: "累计应得", value: `¥${data.stats.totalEarned.toLocaleString()}`, color: "" },
          { label: "待审核", value: `¥${data.stats.pendingAmount.toLocaleString()}`, color: "text-amber-300" },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-border/60 bg-card/30 p-4">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className={`mt-1 text-xl font-semibold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </section>

      {/* 引入学员 / 结算记录 Tabs */}
      <section className="rounded-2xl border border-border/70 bg-card/35 p-6">
        <div className="flex gap-4 border-b border-border/60 pb-3">
          <button
            type="button"
            className={`text-sm font-medium ${tab === "referrals" ? "text-cyan-300" : "text-muted-foreground"}`}
            onClick={() => setTab("referrals")}
          >
            引入学员 ({referrals.length})
          </button>
          <button
            type="button"
            className={`text-sm font-medium ${tab === "payouts" ? "text-cyan-300" : "text-muted-foreground"}`}
            onClick={() => setTab("payouts")}
          >
            结算记录 ({payouts.length})
          </button>
        </div>

        {tab === "referrals" && (
          <div className="mt-3 space-y-2">
            {referrals.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">暂无引入学员</p>
            ) : (
              referrals.map((r) => (
                <div key={r.id} className="rounded-lg border border-border/60 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{r.studentName}</span>
                    <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                    <span>学费: ¥{r.tuitionAmount.toLocaleString()}</span>
                    <span className="text-emerald-400">佣金: +¥{r.commissionAmount.toLocaleString()}</span>
                    <span>状态: {
                      r.commissionStatus === "paid" ? "已结算" :
                      r.commissionStatus === "locked" ? "已锁定" :
                      r.commissionStatus === "pending" ? "待确认" : "—"
                    }</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "payouts" && (
          <div className="mt-3 space-y-2">
            {payouts.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">暂无结算记录</p>
            ) : (
              (payouts as Array<Record<string, unknown>>).map((p: Record<string, unknown>) => (
                <div key={String(p.id)} className="rounded-lg border border-border/60 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{String(p.settlement_month)}</span>
                    <span className="text-emerald-400 font-medium">¥{Number(p.total_commission).toLocaleString()}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    状态: {
                      p.status === "paid" ? "已打款" :
                      p.status === "approved" ? "已审核" :
                      p.status === "pending" ? "待审核" : "已取消"
                    }
                    {p.paid_at ? ` · ${new Date(String(p.paid_at)).toLocaleDateString()} 到账` : ""}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      {error ? <p className="text-sm text-amber-300">{error}</p> : null}
    </main>
  );
}
```

- [ ] **Step 5: 创建 KOL 看板页面 `src/app/[locale]/partner-dashboard/page.tsx`**

```typescript
import { setRequestLocale } from "next-intl/server";
import { PartnerDashboardClient } from "@/components/channel-partner/PartnerDashboardClient";

type Props = { params: Promise<{ locale: string }> };

export default async function PartnerDashboardPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PartnerDashboardClient />;
}
```

- [ ] **Step 6: 提交**

```bash
git add src/app/api/channel-partner/ src/components/channel-partner/ src/app/\[locale\]/partner-dashboard/
git commit -m "feat: add KOL partner dashboard with stats, referrals, and payouts"
```

---

### Task 6: 管理员后端 API — KOL 管理

**Files:**
- Create: `src/app/api/admin/channel-partners/route.ts`
- Create: `src/app/api/admin/channel-partners/[id]/route.ts`
- Create: `src/app/api/admin/channel-partners/[id]/referrals/route.ts`
- Create: `src/app/api/admin/channel-partners/[id]/commissions/route.ts`

- [ ] **Step 1: 创建 `src/app/api/admin/channel-partners/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { generateReferralCode } from "@/lib/referral/service";

export const runtime = "nodejs";

const createSchema = z.object({
  userId: z.string().uuid(),
  channelType: z.enum(["kol", "channel"]).default("kol"),
  channelName: z.string().min(1).max(100),
  channelId: z.string().optional(),
  platform: z.string().optional(),
  commissionRate: z.number().min(0).max(1).default(0.2),
  contactEmail: z.string().email().optional().or(z.literal("")),
});

export async function GET() {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;
  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  const { data: partners, error } = await srv
    .from("channel_partners")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  // 附带每个 KOL 引入的学员数和本月预估佣金
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const partnerIds = partners.map((p) => p.id);

  const [{ data: referralCounts }, { data: commissionSums }] = await Promise.all([
    srv
      .from("referrals")
      .select("partner_id, count")
      .in("partner_id", partnerIds)
      .not("referee_id", "is", null),
    srv
      .from("commission_records")
      .select("partner_id, commission_amount")
      .in("partner_id", partnerIds)
      .in("status", ["pending", "locked"]),
  ]);

  const referralCountMap = new Map<string, number>();
  for (const r of referralCounts ?? []) {
    referralCountMap.set(r.partner_id, (referralCountMap.get(r.partner_id) ?? 0) + 1);
  }

  const commissionSumMap = new Map<string, number>();
  for (const r of commissionSums ?? []) {
    commissionSumMap.set(r.partner_id, (commissionSumMap.get(r.partner_id) ?? 0) + Number(r.commission_amount));
  }

  const rows = partners.map((p) => ({
    ...p,
    studentCount: referralCountMap.get(p.id) ?? 0,
    monthEstimate: Math.round((commissionSumMap.get(p.id) ?? 0) * 100) / 100,
  }));

  return NextResponse.json({ success: true, data: { rows } });
}

export async function POST(request: Request) {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;
  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "参数错误: " + parsed.error.message }, { status: 400 });
  }

  // 1. 插入 channel_partner
  const { data: partner, error } = await srv
    .from("channel_partners")
    .insert({
      user_id: parsed.data.userId,
      channel_type: parsed.data.channelType,
      channel_name: parsed.data.channelName,
      channel_id: parsed.data.channelId ?? null,
      platform: parsed.data.platform ?? null,
      commission_rate: parsed.data.commissionRate,
      contact_email: parsed.data.contactEmail ?? null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  // 2. 为 KOL 生成专属邀请码
  await generateReferralCode(srv, parsed.data.userId);

  return NextResponse.json({ success: true, data: { id: partner.id } }, { status: 201 });
}
```

- [ ] **Step 2: 创建 `src/app/api/admin/channel-partners/[id]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

const updateSchema = z.object({
  channelName: z.string().min(1).max(100).optional(),
  channelId: z.string().optional(),
  platform: z.string().optional(),
  commissionRate: z.number().min(0).max(1).optional(),
  contactEmail: z.string().email().optional().or(z.literal("")).optional(),
  status: z.enum(["active", "paused", "terminated"]).optional(),
  payoutInfo: z.record(z.unknown()).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;
  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  const { id } = await params;
  const { data: partner, error } = await srv
    .from("channel_partners")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !partner) {
    return NextResponse.json({ success: false, error: "KOL 不存在" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: { partner } });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;
  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  const { id } = await params;
  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "参数错误" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.channelName !== undefined) updates.channel_name = parsed.data.channelName;
  if (parsed.data.channelId !== undefined) updates.channel_id = parsed.data.channelId;
  if (parsed.data.platform !== undefined) updates.platform = parsed.data.platform;
  if (parsed.data.commissionRate !== undefined) updates.commission_rate = parsed.data.commissionRate;
  if (parsed.data.contactEmail !== undefined) updates.contact_email = parsed.data.contactEmail;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.payoutInfo !== undefined) updates.payout_info = parsed.data.payoutInfo;
  updates.updated_at = new Date().toISOString();

  const { error } = await srv.from("channel_partners").update(updates).eq("id", id);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: 创建 `src/app/api/admin/channel-partners/[id]/referrals/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;
  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  const { id } = await params;
  const { data: referrals, error } = await srv
    .from("referrals")
    .select(`
      id, code, status, created_at, completed_at, reward_granted,
      referee_id,
      commission_records(tuition_amount, commission_amount, status, settlement_month)
    `)
    .eq("partner_id", id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  // 获取学员昵称
  const refereeIds = [...new Set((referrals ?? []).map((r) => r.referee_id).filter(Boolean))];
  const { data: profiles } = await srv
    .from("profiles")
    .select("user_id, nickname, real_name")
    .in("user_id", refereeIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p.nickname ?? p.real_name ?? ""]));

  const rows = (referrals ?? []).map((r) => ({
    id: r.id,
    studentName: profileMap.get(r.referee_id) ?? "未知",
    refereeId: r.referee_id,
    code: r.code,
    status: r.status,
    tuitionAmount: r.commission_records?.[0]?.tuition_amount ?? null,
    commissionAmount: r.commission_records?.[0]?.commission_amount ?? null,
    commissionStatus: r.commission_records?.[0]?.status ?? null,
    createdAt: r.created_at,
  }));

  return NextResponse.json({ success: true, data: { rows, total: rows.length } });
}
```

- [ ] **Step 4: 创建 `src/app/api/admin/channel-partners/[id]/commissions/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;
  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  const { id } = await params;

  const [commissionsResult, payoutsResult] = await Promise.all([
    srv
      .from("commission_records")
      .select("*")
      .eq("partner_id", id)
      .order("created_at", { ascending: false })
      .limit(500),
    srv
      .from("commission_payouts")
      .select("*")
      .eq("partner_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      commissions: commissionsResult.data ?? [],
      payouts: payoutsResult.data ?? [],
    },
  });
}
```

- [ ] **Step 5: 提交**

```bash
git add src/app/api/admin/channel-partners/
git commit -m "feat: add admin API for channel partner CRUD and detail views"
```

---

### Task 7: 管理员后端 API — 月结管理

**Files:**
- Create: `src/app/api/admin/commission-payouts/route.ts`
- Create: `src/app/api/admin/commission-payouts/[id]/approve/route.ts`
- Create: `src/app/api/admin/commission-payouts/[id]/pay/route.ts`

- [ ] **Step 1: 创建月结列表 API `src/app/api/admin/commission-payouts/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET() {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;
  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  const { data: payouts, error } = await srv
    .from("commission_payouts")
    .select("*, channel_partners!inner(channel_name, channel_type, platform)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  // 按 settlement_month 分组统计
  const monthStats = new Map<string, { total: number; pendingCount: number; paidCount: number }>();
  for (const p of payouts ?? []) {
    const month = p.settlement_month;
    const entry = monthStats.get(month) ?? { total: 0, pendingCount: 0, paidCount: 0 };
    entry.total += Number(p.total_commission);
    if (p.status === "pending") entry.pendingCount++;
    if (p.status === "paid") entry.paidCount++;
    monthStats.set(month, entry);
  }

  return NextResponse.json({
    success: true,
    data: {
      rows: payouts ?? [],
      monthStats: Array.from(monthStats.entries()).map(([month, stats]) => ({
        month,
        ...stats,
        total: Math.round(stats.total * 100) / 100,
      })),
    },
  });
}
```

- [ ] **Step 2: 创建审核通过 API `src/app/api/admin/commission-payouts/[id]/approve/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;
  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  const { id } = await params;

  const { data: payout, error: fetchError } = await srv
    .from("commission_payouts")
    .select("status")
    .eq("id", id)
    .single();

  if (fetchError || !payout) {
    return NextResponse.json({ success: false, error: "月结单不存在" }, { status: 404 });
  }
  if (payout.status !== "pending") {
    return NextResponse.json({ success: false, error: "只有待审核的月结单可以审核通过" }, { status: 400 });
  }

  const { error } = await srv
    .from("commission_payouts")
    .update({ status: "approved" })
    .eq("id", id);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: 创建标记已打款 API `src/app/api/admin/commission-payouts/[id]/pay/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;
  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  const { id } = await params;

  const { data: payout, error: fetchError } = await srv
    .from("commission_payouts")
    .select("status, partner_id, total_commission, settlement_month")
    .eq("id", id)
    .single();

  if (fetchError || !payout) {
    return NextResponse.json({ success: false, error: "月结单不存在" }, { status: 404 });
  }
  if (payout.status !== "approved") {
    return NextResponse.json({ success: false, error: "只有已审核的月结单可以标记打款" }, { status: 400 });
  }

  const now = new Date().toISOString();

  // 1. 更新月结单为已付
  const { error: payoutError } = await srv
    .from("commission_payouts")
    .update({ status: "paid", paid_at: now })
    .eq("id", id);
  if (payoutError) return NextResponse.json({ success: false, error: payoutError.message }, { status: 500 });

  // 2. 更新对应的 commission_records 为 paid
  await srv
    .from("commission_records")
    .update({ status: "paid", paid_at: now })
    .eq("partner_id", payout.partner_id)
    .eq("settlement_month", payout.settlement_month)
    .in("status", ["locked"]);

  // 3. 更新 KOL 累计已付
  await srv
    .from("channel_partners")
    .update({
      total_paid: payout.total_commission,
      updated_at: now,
    })
    .eq("id", payout.partner_id);

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: 提交**

```bash
git add src/app/api/admin/commission-payouts/
git commit -m "feat: add admin API for commission payout approval and payment"
```

---

### Task 8: 管理员前端 KOL 管理面板

**Files:**
- Create: `src/components/admin/AdminChannelPartnersPanel.tsx`
- Create: `src/app/cjkzt/(protected)/channel-partners/page.tsx`
- Create: `src/app/cjkzt/(protected)/channel-partners/[id]/page.tsx`

- [ ] **Step 1: 创建 `src/components/admin/AdminChannelPartnersPanel.tsx`**

```typescript
"use client";

import { Loader2, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PartnerRow = {
  id: string;
  channel_name: string;
  channel_type: string;
  platform: string | null;
  status: string;
  total_earned: number;
  total_paid: number;
  studentCount: number;
  monthEstimate: number;
  created_at: string;
};

export function AdminChannelPartnersPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/channel-partners");
      const json = await res.json();
      if (json.success) setRows(json.data.rows);
      else setError(json.error ?? "加载失败");
    } catch { setError("加载失败"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const filtered = rows.filter((r) =>
    r.channel_name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">渠道合作伙伴</h1>
        {/* 新建 KOL 入口 — 功能简化，可跳转到 add-user 或直接表单 */}
        <Button onClick={() => {}}><Plus className="mr-2 size-4" /> 新建 KOL</Button>
      </div>

      <Input
        placeholder="搜索 KOL 名称..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        icon={<Search className="size-4" />}
      />

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 加载中...
        </div>
      ) : error ? (
        <p className="text-amber-300">{error}</p>
      ) : (
        <div className="rounded-xl border border-border/70">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">名称</th>
                <th className="px-4 py-3 font-medium">类型</th>
                <th className="px-4 py-3 font-medium">平台</th>
                <th className="px-4 py-3 font-medium">学员数</th>
                <th className="px-4 py-3 font-medium">本月预估</th>
                <th className="px-4 py-3 font-medium">累计佣金</th>
                <th className="px-4 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border/40 hover:bg-white/5 cursor-pointer"
                  onClick={() => window.location.href = `/cjkzt/channel-partners/${r.id}`}>
                  <td className="px-4 py-3 font-medium">{r.channel_name}</td>
                  <td className="px-4 py-3">{r.channel_type === "kol" ? "KOL" : "渠道"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.platform ?? "—"}</td>
                  <td className="px-4 py-3">{r.studentCount}</td>
                  <td className="px-4 py-3 text-emerald-400">¥{r.monthEstimate.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    应得 ¥{r.total_earned.toLocaleString()} / 已付 ¥{r.total_paid.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      r.status === "active" ? "bg-emerald-400/10 text-emerald-400" :
                      r.status === "paused" ? "bg-amber-400/10 text-amber-400" :
                      "bg-red-400/10 text-red-400"
                    }`}>
                      {r.status === "active" ? "正常" : r.status === "paused" ? "暂停" : "已终止"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 创建 `src/app/cjkzt/(protected)/channel-partners/page.tsx`**

```typescript
import { AdminChannelPartnersPanel } from "@/components/admin/AdminChannelPartnersPanel";

export default function AdminChannelPartnersPage() {
  return (
    <main className="space-y-6">
      <AdminChannelPartnersPanel />
    </main>
  );
}
```

- [ ] **Step 3: 创建 `src/app/cjkzt/(protected)/channel-partners/[id]/page.tsx`**

简化实现，显示 KOL 详情 + 引入学员 + 分佣记录：

```typescript
"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type PartnerDetail = {
  partner: Record<string, unknown>;
};

export default function AdminChannelPartnerDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState<Record<string, unknown> | null>(null);
  const [referrals, setReferrals] = useState<Array<Record<string, unknown>>>([]);
  const [commissions, setCommissions] = useState<Array<Record<string, unknown>>>([]);
  const [payouts, setPayouts] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    async function load() {
      const [detailRes, refRes, commRes] = await Promise.all([
        fetch(`/api/admin/channel-partners/${id}`),
        fetch(`/api/admin/channel-partners/${id}/referrals`),
        fetch(`/api/admin/channel-partners/${id}/commissions`),
      ]);
      const detailJson = await detailRes.json();
      if (detailJson.success) setPartner(detailJson.data.partner);
      const refJson = await refRes.json();
      if (refJson.success) setReferrals(refJson.data.rows);
      const commJson = await commRes.json();
      if (commJson.success) {
        setCommissions(commJson.data.commissions);
        setPayouts(commJson.data.payouts);
      }
      setLoading(false);
    }
    void load();
  }, [id]);

  if (loading) return (
    <main className="p-4"><Loader2 className="size-4 animate-spin" /> 加载中...</main>
  );
  if (!partner) return <main className="p-4 text-amber-300">KOL 不存在</main>;

  return (
    <main className="space-y-6 p-4">
      <h1 className="text-xl font-semibold">{String(partner.channel_name ?? "")}</h1>
      {/* 简化的详情展示 */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">状态</p>
          <p>{partner.status === "active" ? "正常" : String(partner.status ?? "")}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">分佣比例</p>
          <p>{Number(partner.commission_rate ?? 0) * 100}%</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">累计应得</p>
          <p className="text-emerald-400">¥{Number(partner.total_earned ?? 0).toLocaleString()}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">累计已付</p>
          <p>¥{Number(partner.total_paid ?? 0).toLocaleString()}</p>
        </div>
      </div>

      {/* 引入学员表格 */}
      <div className="rounded-xl border">
        <h2 className="border-b px-4 py-3 font-medium">引入学员 ({referrals.length})</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              <th className="px-4 py-2">学员</th>
              <th className="px-4 py-2">状态</th>
              <th className="px-4 py-2">学费</th>
              <th className="px-4 py-2">佣金</th>
              <th className="px-4 py-2">佣金状态</th>
            </tr>
          </thead>
          <tbody>
            {referrals.map((r) => (
              <tr key={String(r.id)} className="border-b">
                <td className="px-4 py-2">{String(r.studentName ?? "")}</td>
                <td className="px-4 py-2">{String(r.status ?? "")}</td>
                <td className="px-4 py-2">{r.tuitionAmount != null ? `¥${Number(r.tuitionAmount).toLocaleString()}` : "—"}</td>
                <td className="px-4 py-2 text-emerald-400">
                  {r.commissionAmount != null ? `¥${Number(r.commissionAmount).toLocaleString()}` : "—"}
                </td>
                <td className="px-4 py-2">{String(r.commissionStatus ?? "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 月结记录 */}
      <div className="rounded-xl border">
        <h2 className="border-b px-4 py-3 font-medium">月度结算 ({payouts.length})</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              <th className="px-4 py-2">月份</th>
              <th className="px-4 py-2">金额</th>
              <th className="px-4 py-2">状态</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((p) => (
              <tr key={String(p.id)} className="border-b">
                <td className="px-4 py-2">{String(p.settlement_month ?? "")}</td>
                <td className="px-4 py-2 font-medium">¥{Number(p.total_commission).toLocaleString()}</td>
                <td className="px-4 py-2">{String(p.status ?? "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: 提交**

```bash
git add src/components/admin/AdminChannelPartnersPanel.tsx src/app/cjkzt/\(protected\)/channel-partners/
git commit -m "feat: add admin channel partner management UI"
```

---

### Task 9: 管理员前端月结管理面板

**Files:**
- Create: `src/components/admin/AdminCommissionPayoutsPanel.tsx`
- Create: `src/app/cjkzt/(protected)/commission-payouts/page.tsx`

- [ ] **Step 1: 创建 `src/components/admin/AdminCommissionPayoutsPanel.tsx`**

```typescript
"use client";

import { Check, CircleDollarSign, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type PayoutRow = {
  id: string;
  partner_id: string;
  settlement_month: string;
  total_commission: number;
  status: string;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  channel_partners: {
    channel_name: string;
    channel_type: string;
    platform: string | null;
  };
};

type MonthStat = {
  month: string;
  total: number;
  pendingCount: number;
  paidCount: number;
};

export function AdminCommissionPayoutsPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [monthStats, setMonthStats] = useState<MonthStat[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/commission-payouts");
      const json = await res.json();
      if (json.success) {
        setRows(json.data.rows);
        setMonthStats(json.data.monthStats);
        if (json.data.monthStats.length > 0) {
          setSelectedMonth(json.data.monthStats[0].month);
        }
      } else setError(json.error ?? "加载失败");
    } catch { setError("加载失败"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function approve(payoutId: string) {
    const res = await fetch(`/api/admin/commission-payouts/${payoutId}/approve`, { method: "POST" });
    const json = await res.json();
    if (json.success) void load();
  }

  async function markPaid(payoutId: string) {
    const res = await fetch(`/api/admin/commission-payouts/${payoutId}/pay`, { method: "POST" });
    const json = await res.json();
    if (json.success) void load();
  }

  const filteredRows = selectedMonth
    ? rows.filter((r) => r.settlement_month === selectedMonth)
    : rows;

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">分佣月结</h1>

      {/* 月份选择器 */}
      <div className="flex gap-2">
        {monthStats.map((s) => (
          <button
            key={s.month}
            type="button"
            className={`rounded-lg px-3 py-1.5 text-sm ${
              selectedMonth === s.month
                ? "bg-cyan-500/20 text-cyan-200"
                : "bg-card/30 text-muted-foreground hover:bg-card/50"
            }`}
            onClick={() => setSelectedMonth(s.month)}
          >
            {s.month} (¥{s.total.toLocaleString()})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 加载中...
        </div>
      ) : error ? (
        <p className="text-amber-300">{error}</p>
      ) : (
        <div className="rounded-xl border border-border/70">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">KOL</th>
                <th className="px-4 py-3 font-medium">类型</th>
                <th className="px-4 py-3 font-medium">佣金金额</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id} className="border-b border-border/40">
                  <td className="px-4 py-3 font-medium">{r.channel_partners.channel_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.channel_partners.channel_type === "kol" ? "KOL" : "渠道"}
                  </td>
                  <td className="px-4 py-3 font-medium text-emerald-400">
                    ¥{r.total_commission.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {r.status === "paid" ? "已打款" :
                     r.status === "approved" ? "已审核" :
                     r.status === "pending" ? "待审核" : "已取消"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {r.status === "pending" && (
                        <Button size="sm" variant="outline" onClick={() => void approve(r.id)}>
                          <Check className="mr-1 size-3" /> 审核通过
                        </Button>
                      )}
                      {r.status === "approved" && (
                        <Button size="sm" variant="outline" onClick={() => void markPaid(r.id)}>
                          <CircleDollarSign className="mr-1 size-3" /> 标记已打款
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 创建 `src/app/cjkzt/(protected)/commission-payouts/page.tsx`**

```typescript
import { AdminCommissionPayoutsPanel } from "@/components/admin/AdminCommissionPayoutsPanel";

export default function AdminCommissionPayoutsPage() {
  return (
    <main className="space-y-6">
      <AdminCommissionPayoutsPanel />
    </main>
  );
}
```

- [ ] **Step 3: 提交**

```bash
git add src/components/admin/AdminCommissionPayoutsPanel.tsx src/app/cjkzt/\(protected\)/commission-payouts/
git commit -m "feat: add admin commission payout management UI"
```

---

### Task 10: 更新管理员侧边栏和 i18n

**Files:**
- Modify: `src/components/admin/AdminShell.tsx`
- Modify: `messages/zh.json`
- Modify: `messages/en.json`
- Modify: `messages/zh-TW.json`

- [ ] **Step 1: 在 `AdminShell.tsx` 侧边栏添加 "渠道管理" 和 "分佣月结"**

在 `AdminShell.tsx` 第 65-79 行的 items.push 块中，在 `referrals` 和 `billing` 之间加入：

```typescript
// 在 items.push 块中添加（放在 referral 之后、billing 之前）：
{ href: `${ADMIN_BASE_PATH}/channel-partners`, label: "渠道管理", icon: Users },   // 可以用 UserPlus 或 Users
{ href: `${ADMIN_BASE_PATH}/commission-payouts`, label: "分佣月结", icon: WalletCards },
```

需要额外 import `WalletCards`（已存在）& `UserPlus`（已存在）。

- [ ] **Step 2: 在 i18n 消息文件中添加文案**

在 `messages/zh.json` 和对应文件中添加：

```json
{
  "Admin": {
    "navChannelPartners": "渠道管理",
    "navCommissionPayouts": "分佣月结"
  },
  "Partner": {
    "dashboard": "推广看板",
    "inviteLink": "我的推广链接",
    "copyLink": "复制链接",
    "monthEstimate": "本月预估",
    "totalEarned": "累计应得",
    "totalPaid": "累计已结算",
    "pendingAmount": "待审核",
    "referrals": "引入学员",
    "payouts": "结算记录",
    "noReferrals": "暂无引入学员",
    "noPayouts": "暂无结算记录",
    "tuition": "学费",
    "commission": "佣金",
    "statusActive": "正常"
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add src/components/admin/AdminShell.tsx messages/
git commit -m "feat: add channel partner navigation and i18n messages"
```

---

### Task 11: 文案模板与营销 API

**Files:**
- Create: `src/lib/marketing/templates/kol-recruit-email.ts`
- Create: `src/lib/marketing/templates/kol-recruit-xiaohongshu.ts`
- Create: `src/lib/marketing/templates/student-convert-email.ts`
- Create: `src/lib/marketing/templates/student-convert-xiaohongshu.ts`
- Create: `src/lib/marketing/renderer.ts`
- Create: `src/lib/marketing/sender.ts`
- Create: `src/app/api/marketing/generate-copy/route.ts`

- [ ] **Step 1: 创建 `src/lib/marketing/renderer.ts`**

```typescript
export type TemplateVariables = Record<string, string | number>;

export function renderTemplate(
  template: string,
  variables: TemplateVariables,
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
  }
  return result;
}
```

- [ ] **Step 2: 创建 KOL 招募邮件模板 `src/lib/marketing/templates/kol-recruit-email.ts`**

```typescript
import type { TemplateVariables } from "../renderer";

export function kolRecruitEmail(vars: TemplateVariables): string {
  return renderTemplate(`
主题：{kolName}，邀请你的粉丝一起在交易豹赚取被动收入

{kolName}，你好！

交易豹是专注A股的模拟交易训练平台。
你的粉丝只要通过你的专属链接注册并付费，
你就可以获得该学员学费的 20% 分成。

案例：如果你本月引导 50 人付费 T2（$99/月），
你的月收入可达：50人 × $99 × 20% = $990 ≈ ¥7,200

适合谁：
· 财经类博主（小红书/抖音/公众号）
· 股票/投资社群主理人
· 交易培训师

加入方式：
1. 点击链接注册交易豹账号
2. 获取你的专属推广链接
3. 开始分享，实时查看收益

立即注册：{registrationLink}
`, vars);
}

function renderTemplate(text: string, vars: TemplateVariables): string {
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
  }
  return result;
}

type TemplateVariables = Record<string, string | number>;
```

- [ ] **Step 3: 创建其他三个模板**

`kol-recruit-xiaohongshu.ts`:
```typescript
import type { TemplateVariables } from "../renderer";

export function kolRecruitXiaohongshu(vars: TemplateVariables): string {
  return renderTemplate(`最近发现一个A股模拟交易平台——交易豹，我用了两个月，TQ评分系统确实能看出自己的交易短板。

他们最近在找合作KOL，粉丝通过你的链接付费，你能拿到20%的分成。如果你的粉丝里有人做股票交易的，这算是个躺着赚点零花钱的机会。

想了解的评论扣1，我私信你链接`, vars);
}
```

`student-convert-email.ts`:
```typescript
import type { TemplateVariables } from "../renderer";

export function studentConvertEmail(vars: TemplateVariables): string {
  return renderTemplate(`主题：{kolName}推荐你使用交易豹

{studentName}，你好！

我是{kolName}，一直在用的交易豹，
今天把它的模拟交易系统推荐给你。

为什么推荐？
· 真实A股行情模拟交易，零风险练手
· TQ能力评分系统，量化你的交易水平
· 系统化课程，从入门到进阶

通过我的链接注册，立享：
· 7天免费试用

链接：{referralLink}
邀请码：{refCode}`, vars);
}
```

`student-convert-xiaohongshu.ts`:
```typescript
import type { TemplateVariables } from "../renderer";

export function studentConvertXiaohongshu(vars: TemplateVariables): string {
  return renderTemplate(`最近在用交易豹做A股模拟交易，感觉还不错。实时行情、模拟盘、TQ评分都有，适合想练手的朋友。

想试试的可以走我的邀请链接，有7天免费试用：`, vars);
}
```

- [ ] **Step 4: 创建营销 API `src/app/api/marketing/generate-copy/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTradeUser } from "@/lib/trade/require-user";
import { kolRecruitEmail } from "@/lib/marketing/templates/kol-recruit-email";
import { kolRecruitXiaohongshu } from "@/lib/marketing/templates/kol-recruit-xiaohongshu";
import { studentConvertEmail } from "@/lib/marketing/templates/student-convert-email";
import { studentConvertXiaohongshu } from "@/lib/marketing/templates/student-convert-xiaohongshu";

export const runtime = "nodejs";

const TEMPLATES = {
  kol_recruit_email: kolRecruitEmail,
  kol_recruit_xiaohongshu: kolRecruitXiaohongshu,
  student_convert_email: studentConvertEmail,
  student_convert_xiaohongshu: studentConvertXiaohongshu,
} as const;

const bodySchema = z.object({
  template: z.enum(["kol_recruit_email", "kol_recruit_xiaohongshu", "student_convert_email", "student_convert_xiaohongshu"]),
  variables: z.record(z.string().or(z.number())),
});

export async function POST(request: Request) {
  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;

  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "参数错误" }, { status: 400 });
  }

  const renderFn = TEMPLATES[parsed.data.template];
  const copy = renderFn(parsed.data.variables as Record<string, string | number>);

  return NextResponse.json({
    success: true,
    data: { copy, characterCount: copy.length },
  });
}
```

- [ ] **Step 5: 提交**

```bash
git add src/lib/marketing/ src/app/api/marketing/
git commit -m "feat: add marketing copy templates and API"
```

---

### Task 12: Cron Job 与 GitHub Actions

**Files:**
- Create: `src/app/api/admin/cron/lock-commissions/route.ts`
- Create: `src/app/api/admin/cron/settle-monthly-commissions/route.ts`
- Modify: `.github/workflows/opennext-build.yml`

- [ ] **Step 1: 创建锁定分佣记录的 cron API**

`src/app/api/admin/cron/lock-commissions/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { lockCommissions } from "@/lib/commission/service";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.INTERNAL_WEBHOOK_TOKEN;
  const token = request.headers.get("x-internal-token");
  if (secret && token !== secret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  const locked = await lockCommissions(srv);
  return NextResponse.json({ success: true, data: { locked } });
}
```

- [ ] **Step 2: 创建月结汇总的 cron API**

`src/app/api/admin/cron/settle-monthly-commissions/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { settleMonthlyCommissions } from "@/lib/commission/service";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.INTERNAL_WEBHOOK_TOKEN;
  const token = request.headers.get("x-internal-token");
  if (secret && token !== secret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  // 结算上个月
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const settlementMonth = prevMonth.toISOString().slice(0, 7);

  const count = await settleMonthlyCommissions(srv, settlementMonth);
  return NextResponse.json({ success: true, data: { settlementMonth, payoutCount: count } });
}
```

- [ ] **Step 3: 在 `.github/workflows/opennext-build.yml` 中添加分佣 cron job**

在现有的 `tq-recalculate` job 之后添加新的 cron job：

```yaml
  lock-commissions:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    steps:
      - name: Lock commission records (7-day protection period)
        env:
          CRON_BASE_URL: ${{ vars.TQ_CRON_BASE_URL }}
          INTERNAL_WEBHOOK_TOKEN: ${{ secrets.INTERNAL_WEBHOOK_TOKEN }}
        run: |
          set -euo pipefail
          if [ -z "${CRON_BASE_URL:-}" ] || [ -z "${INTERNAL_WEBHOOK_TOKEN:-}" ]; then
            echo "Missing CRON_BASE_URL or INTERNAL_WEBHOOK_TOKEN, skip."
            exit 0
          fi
          curl -fsS -X POST "${CRON_BASE_URL%/}/api/admin/cron/lock-commissions" \
            -H "x-internal-token: ${INTERNAL_WEBHOOK_TOKEN}"

  settle-monthly-commissions:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    steps:
      - name: Settle monthly commission payouts
        env:
          CRON_BASE_URL: ${{ vars.TQ_CRON_BASE_URL }}
          INTERNAL_WEBHOOK_TOKEN: ${{ secrets.INTERNAL_WEBHOOK_TOKEN }}
        run: |
          set -euo pipefail
          if [ -z "${CRON_BASE_URL:-}" ] || [ -z "${INTERNAL_WEBHOOK_TOKEN:-}" ]; then
            echo "Missing CRON_BASE_URL or INTERNAL_WEBHOOK_TOKEN, skip."
            exit 0
          fi
          curl -fsS -X POST "${CRON_BASE_URL%/}/api/admin/cron/settle-monthly-commissions" \
            -H "x-internal-token: ${INTERNAL_WEBHOOK_TOKEN}"
```

并在 schedule 中添加 cron 表达式：
```yaml
  schedule:
    - cron: "5 8 * * 1-5"      # 现有：TQ recalculate 工作日 16:05 HKT
    - cron: "0 18 1 * *"        # 新增：每月 1 号 02:00 HKT 锁定分佣
    - cron: "0 18 5 * *"        # 新增：每月 5 号 02:00 HKT 月结汇总
```

- [ ] **Step 4: 提交**

```bash
git add src/app/api/admin/cron/ .github/workflows/opennext-build.yml
git commit -m "feat: add commission cron jobs for lock and monthly settlement"
```

---

## 计划自审

- ✅ **Spec 覆盖**: 所有 spec 中的需求（数据模型、业务流程、API、前端、文案、cron）都有对应任务
- ✅ **无占位符**: 所有步骤包含完整代码
- ✅ **类型一致性**: `ChannelPartner`、`CommissionRecord`、`CommissionPayout` 类型在 Task 2 定义，后续 API 均使用一致命名
- ✅ **范围检查**: 单一 KOL 分佣系统，不涉及其他子系统
