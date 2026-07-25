-- 视频观看人次统计 + 合作伙伴二维码
-- 日期: 2026-06-17

-- ============================================================
-- 1. course_videos 增加 view_count
-- ============================================================
ALTER TABLE public.course_videos ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- 2. video_view_log 观看日志表（每次播放都记录，含游客）
-- ============================================================
-- 注意: view_count 现在由 play API 直接递增，此表仅作审计日志
CREATE TABLE IF NOT EXISTS public.video_view_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES public.course_videos(id) ON DELETE CASCADE,
  user_id UUID, -- 可空，游客无 user_id
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS video_view_log_video_id_idx ON public.video_view_log(video_id);

ALTER TABLE public.video_view_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. courses 增加合作伙伴 QR
-- ============================================================
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS partner_qr_url TEXT;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS partner_qr_label TEXT NOT NULL DEFAULT '合作夥伴';

-- ============================================================
-- 4. 为每个视频设置随机起始观看人次（高四位数 5000-9999，每个视频不同）
-- ============================================================
UPDATE public.course_videos
SET view_count = 5000 + floor(random() * 5000)::int
WHERE view_count = 0;
