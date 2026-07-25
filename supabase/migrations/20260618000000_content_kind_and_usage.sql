-- 內容類型區分 + 每月觀看時間追蹤
-- 日期: 2026-06-18
-- 用途: 區分 AI+經典（訂閱制）vs KOL（按片付費），追蹤會員每月觀看配額

-- ============================================================
-- 1. course_topics 新增 content_kind
-- ============================================================
ALTER TABLE public.course_topics
ADD COLUMN IF NOT EXISTS content_kind TEXT NOT NULL DEFAULT 'kol'
CHECK (content_kind IN ('ai_classic', 'kol'));

CREATE INDEX IF NOT EXISTS course_topics_content_kind_idx
ON public.course_topics(content_kind);

-- ============================================================
-- 2. 每月觀看用量追蹤
-- ============================================================
CREATE TABLE IF NOT EXISTS public.monthly_video_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  month_key TEXT NOT NULL, -- "2026-06"
  consumed_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, month_key)
);

CREATE INDEX IF NOT EXISTS monthly_video_usage_user_month_idx
ON public.monthly_video_usage(user_id, month_key);

ALTER TABLE public.monthly_video_usage ENABLE ROW LEVEL SECURITY;

-- 前端的 current user 只能看自己的
DROP POLICY IF EXISTS "users read own monthly usage" ON public.monthly_video_usage;
CREATE POLICY "users read own monthly usage" ON public.monthly_video_usage
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- 3. upsert function (安全定義器，service role 調用)
-- ============================================================
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
