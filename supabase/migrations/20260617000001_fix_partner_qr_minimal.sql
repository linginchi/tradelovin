-- ============================================================
-- 广发证券合作伙伴二维码 — 最小修复 SQL
-- 在 Supabase Dashboard > SQL Editor 中执行
-- ============================================================

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS partner_qr_url TEXT;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS partner_qr_label TEXT NOT NULL DEFAULT '合作夥伴';
