-- LEO-008: draft / schedule / live publishing gate for course_videos.
-- NULL = draft (not public); <= now() = live; > now() = scheduled.

ALTER TABLE public.course_videos
	ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

COMMENT ON COLUMN public.course_videos.published_at IS
	'NULL=draft; timestamptz<=now()=live; future=scheduled. Public lists/play exclude drafts and future rows.';

-- One-time backfill: existing rows become live. New pipeline drafts insert NULL after this.
UPDATE public.course_videos
SET published_at = COALESCE(created_at, NOW())
WHERE published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_course_videos_published_at
	ON public.course_videos (published_at);
