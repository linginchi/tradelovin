-- Real-playback video view events with per-viewer deduplication.
--
-- Scope note: the visible counter public.course_videos.view_count and the
-- public.increment_course_video_view_count() RPC are the authoritative
-- definitions owned by 20260715072400_restore_course_video_view_count.sql and
-- are deliberately NOT redefined here, so the counter has exactly one owner.
--
-- This migration contains schema only: no seed, no backfill, no synthetic or
-- randomised history, and no scheduled increment.

CREATE TABLE IF NOT EXISTS public.video_view_events (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	video_id UUID NOT NULL REFERENCES public.course_videos(id) ON DELETE CASCADE,
	-- NOT NULL enforces the product rule that anonymous playback never counts.
	user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	-- Start of the 30 minute tumbling dedup window the event belongs to.
	window_start TIMESTAMPTZ NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Atomic anti-flood guarantee: one countable event per viewer, video and
-- window, enforced by the database rather than by a read-then-write check.
CREATE UNIQUE INDEX IF NOT EXISTS video_view_events_dedup_idx
	ON public.video_view_events(video_id, user_id, window_start);

CREATE INDEX IF NOT EXISTS video_view_events_video_id_idx
	ON public.video_view_events(video_id, created_at DESC);

-- No policy is defined: viewer-level rows stay reachable only through the
-- service role, so no client can read who watched what.
ALTER TABLE public.video_view_events ENABLE ROW LEVEL SECURITY;

-- Atomically insert a dedup event and, only for a fresh insert, increment the
-- visible counter. A single PL/pgSQL call is one transaction, so a viewer
-- cannot permanently leave behind an event without the matching +1.
CREATE OR REPLACE FUNCTION public.record_course_video_view(
	p_video_id UUID,
	p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_window_start TIMESTAMPTZ;
	v_inserted_id UUID;
	v_count BIGINT;
BEGIN
	-- 30-minute tumbling window keyed on the database clock.
	v_window_start := to_timestamp(floor(extract(epoch FROM clock_timestamp()) / 1800) * 1800);

	INSERT INTO public.video_view_events (video_id, user_id, window_start)
	VALUES (p_video_id, p_user_id, v_window_start)
	ON CONFLICT (video_id, user_id, window_start) DO NOTHING
	RETURNING id INTO v_inserted_id;

	IF v_inserted_id IS NULL THEN
		SELECT cv.view_count INTO v_count
		FROM public.course_videos cv
		WHERE cv.id = p_video_id;

		RETURN jsonb_build_object(
			'counted', false,
			'view_count', v_count
		);
	END IF;

	-- Reuse the authoritative counter RPC; it runs in this same transaction.
	v_count := public.increment_course_video_view_count(p_video_id);

	RETURN jsonb_build_object(
		'counted', true,
		'view_count', v_count
	);
END;
$$;

REVOKE ALL ON FUNCTION public.record_course_video_view(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_course_video_view(UUID, UUID) TO service_role;
