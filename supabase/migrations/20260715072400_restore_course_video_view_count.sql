ALTER TABLE public.course_videos
  ADD COLUMN IF NOT EXISTS view_count BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'course_videos_view_count_nonnegative'
      AND conrelid = 'public.course_videos'::regclass
  ) THEN
    ALTER TABLE public.course_videos
      ADD CONSTRAINT course_videos_view_count_nonnegative CHECK (view_count >= 0);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.increment_course_video_view_count(p_video_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_count BIGINT;
BEGIN
  UPDATE public.course_videos
  SET
    view_count = view_count + 1,
    updated_at = NOW()
  WHERE id = p_video_id
  RETURNING view_count INTO next_count;

  RETURN next_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_course_video_view_count(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_course_video_view_count(UUID) TO service_role;
