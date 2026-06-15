-- KOL 双通道邀请与自荐审核系统扩展
-- - 自荐申请增加 pending_review 状态
-- - kol_invite_codes 增加 target_user_id 支持定向邀请
-- 日期：2026-06-15

ALTER TABLE public.channel_partners DROP CONSTRAINT IF EXISTS channel_partners_status_check;
ALTER TABLE public.channel_partners ADD CONSTRAINT channel_partners_status_check CHECK (status IN ('active', 'paused', 'terminated', 'pending_review'));

ALTER TABLE public.kol_invite_codes ADD COLUMN IF NOT EXISTS target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.kol_invite_codes ADD COLUMN IF NOT EXISTS notes TEXT;
