-- AI 内容加工线：course_videos 新增 AI 元数据欄位
-- 日期: 2026-06-17

-- ============================================================
-- course_videos 新增 AI 相关欄位
-- ============================================================
ALTER TABLE public.course_videos ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE public.course_videos ADD COLUMN IF NOT EXISTS source_platform TEXT; -- "youtube", "bilibili" 等
ALTER TABLE public.course_videos ADD COLUMN IF NOT EXISTS is_ai_processed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.course_videos ADD COLUMN IF NOT EXISTS has_ai_narration BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.course_videos ADD COLUMN IF NOT EXISTS original_language TEXT; -- "en", "zh" 等
ALTER TABLE public.course_videos ADD COLUMN IF NOT EXISTS segment_index INTEGER; -- 分段序号 (NULL=非分段, 1/2/3...)
ALTER TABLE public.course_videos ADD COLUMN IF NOT EXISTS segment_total INTEGER; -- 分段总数 (NULL=非分段)

-- ============================================================
-- ai_pipeline_jobs 加工管線任務表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_pipeline_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url TEXT NOT NULL,
  source_platform TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'downloading', 'transcribing', 'translating',
    'generating_tts', 'compositing', 'uploading', 'completed', 'failed'
  )),
  target_course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  target_video_ids UUID[] DEFAULT '{}',
  segment_count INTEGER NOT NULL DEFAULT 1,
  error_log TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================================
-- ai_redbook_articles 小紅書文章記錄表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_redbook_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_urls TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'published')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
