-- ============================================================
-- TradeLovin 整合遷移腳本
-- 日期: 2026-06-18
-- 用法: 貼到 Supabase Dashboard → SQL Editor → 全選執行
-- 含以下遷移:
--   20260610100000: 引導 mark@hkfac.org 為超級管理員
--   20260617000000: video_view_log 觀看日誌 + view_count + partner_qr
--   20260617000002: 移除 view_log 唯一約束 / user_id 可空
--   20260617000003: 種子隨機觀看人次
--   20260617190000: course_topics 主題分組
--   20260617200000: KOL 自薦申請
--   20260618000000: content_kind + monthly_video_usage
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 引導超級管理員 mark@hkfac.org
-- ============================================================
INSERT INTO public.admins (email, role, created_by)
VALUES ('mark@hkfac.org', 'super_admin', NULL)
ON CONFLICT (email) DO UPDATE SET role = excluded.role;

-- ============================================================
-- 2. 視頻觀看人次 + 合作夥伴 QR
-- ============================================================
ALTER TABLE public.course_videos ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.video_view_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES public.course_videos(id) ON DELETE CASCADE,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS video_view_log_video_id_idx ON public.video_view_log(video_id);
ALTER TABLE public.video_view_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS partner_qr_url TEXT;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS partner_qr_label TEXT NOT NULL DEFAULT '合作夥伴';

-- ============================================================
-- 3. 移除 video_view_log 唯一約束 + user_id 可空
-- ============================================================
ALTER TABLE public.video_view_log DROP CONSTRAINT IF EXISTS video_view_log_video_id_user_id_key;
ALTER TABLE public.video_view_log ALTER COLUMN user_id DROP NOT NULL;

-- ============================================================
-- 4. 種子隨機觀看人次 (5000-9999)
-- ============================================================
UPDATE public.course_videos
SET view_count = 5000 + floor(random() * 5000)::int
WHERE view_count = 0;

-- ============================================================
-- 5. 教學主題分組 course_topics
-- ============================================================
CREATE TABLE IF NOT EXISTS public.course_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS topic_id UUID REFERENCES public.course_topics(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS courses_topic_id_idx ON public.courses(topic_id);
ALTER TABLE public.course_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read active topics" ON public.course_topics;
CREATE POLICY "public read active topics" ON public.course_topics
  FOR SELECT USING (is_active = true);

-- ============================================================
-- 6. KOL 自薦申請
-- ============================================================
CREATE TABLE IF NOT EXISTS public.kol_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  channel_name TEXT,
  platform_accounts JSONB NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  email_verified_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN ('pending_verification', 'pending_review', 'approved', 'rejected')),
  reject_reason TEXT,
  invite_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kol_applications_email_idx ON public.kol_applications (lower(email));
CREATE INDEX IF NOT EXISTS kol_applications_status_idx ON public.kol_applications (status);
ALTER TABLE public.kol_applications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.email_verification_codes DROP CONSTRAINT IF EXISTS email_verification_codes_intent_check;
ALTER TABLE public.email_verification_codes ADD CONSTRAINT email_verification_codes_intent_check
  CHECK (intent IN ('register', 'login', 'kol_application'));

-- ============================================================
-- 7. content_kind + monthly_video_usage（訂閱制核心）
-- ============================================================
ALTER TABLE public.course_topics
ADD COLUMN IF NOT EXISTS content_kind TEXT NOT NULL DEFAULT 'kol'
CHECK (content_kind IN ('ai_classic', 'kol'));

CREATE INDEX IF NOT EXISTS course_topics_content_kind_idx
ON public.course_topics(content_kind);

CREATE TABLE IF NOT EXISTS public.monthly_video_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  month_key TEXT NOT NULL,
  consumed_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, month_key)
);

CREATE INDEX IF NOT EXISTS monthly_video_usage_user_month_idx
ON public.monthly_video_usage(user_id, month_key);

ALTER TABLE public.monthly_video_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own monthly usage" ON public.monthly_video_usage;
CREATE POLICY "users read own monthly usage" ON public.monthly_video_usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.upsert_monthly_video_usage(
  p_user_id UUID,
  p_month_key TEXT,
  p_seconds INT
) RETURNS void AS $$
BEGIN
  INSERT INTO public.monthly_video_usage (user_id, month_key, consumed_seconds)
  VALUES (p_user_id, p_month_key, p_seconds)
  ON CONFLICT (user_id, month_key)
  DO UPDATE SET consumed_seconds = monthly_video_usage.consumed_seconds + p_seconds,
                updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
