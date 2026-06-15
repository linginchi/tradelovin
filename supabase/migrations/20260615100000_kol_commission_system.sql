-- KOL/渠道分佣系统：新增 channel_partners / commission_records / commission_payouts 表
-- 并扩展 referrals 表支持 KOL 分佣场景
-- 日期：2026-06-15

-- ============================================================
-- 1. channel_partners — KOL/渠道合作伙伴档案
-- ============================================================
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

CREATE INDEX IF NOT EXISTS channel_partners_user_id_idx ON public.channel_partners(user_id);
CREATE INDEX IF NOT EXISTS channel_partners_status_idx ON public.channel_partners(status);

-- ============================================================
-- 2. commission_records — 每笔分佣明细
-- ============================================================
CREATE TABLE IF NOT EXISTS public.commission_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES channel_partners(id) ON DELETE CASCADE,
  referral_id UUID REFERENCES referrals(id) ON DELETE SET NULL,
  student_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_transaction_id TEXT,
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
CREATE INDEX IF NOT EXISTS commission_records_status_idx ON public.commission_records(status);

-- ============================================================
-- 3. commission_payouts — 月结汇总
-- ============================================================
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
CREATE INDEX IF NOT EXISTS commission_payouts_status_idx ON public.commission_payouts(status);

-- ============================================================
-- 4. 扩展 referrals 表
-- ============================================================
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES channel_partners(id) ON DELETE SET NULL;
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS commission_paid DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.referrals DROP CONSTRAINT IF EXISTS referrals_status_check;
ALTER TABLE public.referrals ADD CONSTRAINT referrals_status_check CHECK (status IN (
  'pending', 'completed_auth', 'completed_payment', 'completed_commission'
));

CREATE INDEX IF NOT EXISTS referrals_partner_id_idx ON public.referrals(partner_id);

-- ============================================================
-- 5. RLS 策略
-- ============================================================
ALTER TABLE public.channel_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_payouts ENABLE ROW LEVEL SECURITY;

-- channel_partners: KOL 自己可以看自己的档案；管理员可以看全部
CREATE POLICY channel_partners_own_select ON public.channel_partners
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY channel_partners_admin_select ON public.channel_partners
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid()));

CREATE POLICY channel_partners_admin_insert ON public.channel_partners
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid()));

CREATE POLICY channel_partners_admin_update ON public.channel_partners
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid()));

-- commission_records: KOL 查自己的；管理员查全部
CREATE POLICY commission_records_own_select ON public.commission_records
  FOR SELECT TO authenticated
  USING (partner_id IN (SELECT id FROM public.channel_partners WHERE user_id = auth.uid()));

CREATE POLICY commission_records_admin_select ON public.commission_records
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid()));

-- commission_payouts: KOL 查自己的；管理员查全部
CREATE POLICY commission_payouts_own_select ON public.commission_payouts
  FOR SELECT TO authenticated
  USING (partner_id IN (SELECT id FROM public.channel_partners WHERE user_id = auth.uid()));

CREATE POLICY commission_payouts_admin_select ON public.commission_payouts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid()));

CREATE POLICY commission_payouts_admin_update ON public.commission_payouts
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid()));

-- ============================================================
-- 6. 辅助函数：增加 channel_partners.total_earned
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_channel_partner_total_earned(
  p_partner_id UUID,
  p_amount DECIMAL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.channel_partners
  SET total_earned = total_earned + p_amount,
      updated_at = NOW()
  WHERE id = p_partner_id;
END;
$$;
