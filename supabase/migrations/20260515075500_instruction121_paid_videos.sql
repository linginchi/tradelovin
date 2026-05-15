CREATE TABLE IF NOT EXISTS public.course_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  duration INT,
  sort_order INT NOT NULL DEFAULT 0,
  storage_key TEXT NOT NULL,
  is_free_preview BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_videos_course_sort
  ON public.course_videos(course_id, sort_order, created_at);

CREATE TABLE IF NOT EXISTS public.user_video_progress (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES public.course_videos(id) ON DELETE CASCADE,
  last_position INT NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_user_video_progress_video
  ON public.user_video_progress(video_id);

ALTER TABLE public.course_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_video_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "course_videos_select_policy" ON public.course_videos;
CREATE POLICY "course_videos_select_policy"
  ON public.course_videos
  FOR SELECT
  USING (
    is_free_preview = true
    OR EXISTS (
      SELECT 1
      FROM public.course_registrations cr
      WHERE cr.course_id = course_videos.course_id
        AND cr.user_id = auth.uid()
        AND cr.status IN ('approved', 'paid')
    )
  );

DROP POLICY IF EXISTS "user_video_progress_select_own" ON public.user_video_progress;
CREATE POLICY "user_video_progress_select_own"
  ON public.user_video_progress
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_video_progress_insert_own" ON public.user_video_progress;
CREATE POLICY "user_video_progress_insert_own"
  ON public.user_video_progress
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_video_progress_update_own" ON public.user_video_progress;
CREATE POLICY "user_video_progress_update_own"
  ON public.user_video_progress
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
