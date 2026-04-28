-- 报名表状态（与前台提交逻辑一致）
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
