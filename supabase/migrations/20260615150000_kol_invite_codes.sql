-- KOL/渠道邀请码表：管理员预生成邀请码，KOL 通过邀请码注册成为渠道合作伙伴
-- 日期：2026-06-15

CREATE TABLE IF NOT EXISTS public.kol_invite_codes (
  code TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ
);

ALTER TABLE public.kol_invite_codes ENABLE ROW LEVEL SECURITY;

-- 管理员可查看全部邀请码（幂等：先删后建）
DROP POLICY IF EXISTS kol_invite_codes_admin_select ON public.kol_invite_codes;
CREATE POLICY kol_invite_codes_admin_select ON public.kol_invite_codes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.admins
    WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
  ));
