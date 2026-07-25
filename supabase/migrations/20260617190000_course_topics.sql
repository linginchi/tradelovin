-- 教學主題分組：course_topics + courses.topic_id
-- 日期: 2026-06-17

CREATE TABLE IF NOT EXISTS public.course_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.courses
ADD COLUMN IF NOT EXISTS topic_id UUID REFERENCES public.course_topics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS courses_topic_id_idx ON public.courses(topic_id);

ALTER TABLE public.course_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read active topics" ON public.course_topics;
CREATE POLICY "public read active topics" ON public.course_topics
  FOR SELECT USING (is_active = true);
