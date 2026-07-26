-- Marketing popularity (热度/人气) for course videos — separate from real view_count.
--
-- Real playback counting remains owned by:
--   20260715072400_restore_course_video_view_count.sql
--   20260725170000_video_view_events.sql
-- This migration must never redefine or bump public.course_videos.view_count.
--
-- Growth plans are deterministic per (video_id, Hong Kong calendar day).
-- Hourly applies are idempotent: each (video_id, plan_date, hour_slot) at most once.

ALTER TABLE public.course_videos
	ADD COLUMN IF NOT EXISTS marketing_view_count BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'course_videos_marketing_view_count_nonnegative'
	) THEN
		ALTER TABLE public.course_videos
			ADD CONSTRAINT course_videos_marketing_view_count_nonnegative
			CHECK (marketing_view_count >= 0);
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.course_video_marketing_growth_plans (
	video_id UUID NOT NULL REFERENCES public.course_videos(id) ON DELETE CASCADE,
	-- Calendar date in Asia/Hong_Kong (application supplies the date string).
	plan_date DATE NOT NULL,
	baseline_count BIGINT NOT NULL CHECK (baseline_count >= 0),
	daily_increment BIGINT NOT NULL CHECK (daily_increment >= 0),
	-- 100 = 1% weekday, 200 = 2% weekend
	rate_bps INT NOT NULL CHECK (rate_bps IN (100, 200)),
	hour_allocations BIGINT[] NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	PRIMARY KEY (video_id, plan_date),
	CONSTRAINT course_video_marketing_growth_plans_hours_len
		CHECK (cardinality(hour_allocations) = 24)
);

CREATE TABLE IF NOT EXISTS public.course_video_marketing_growth_applies (
	video_id UUID NOT NULL REFERENCES public.course_videos(id) ON DELETE CASCADE,
	plan_date DATE NOT NULL,
	hour_slot SMALLINT NOT NULL CHECK (hour_slot >= 0 AND hour_slot <= 23),
	increment_applied BIGINT NOT NULL CHECK (increment_applied >= 0),
	applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	PRIMARY KEY (video_id, plan_date, hour_slot),
	FOREIGN KEY (video_id, plan_date)
		REFERENCES public.course_video_marketing_growth_plans(video_id, plan_date)
		ON DELETE CASCADE
);

ALTER TABLE public.course_video_marketing_growth_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_video_marketing_growth_applies ENABLE ROW LEVEL SECURITY;

-- Atomic hourly apply: insert apply row; only on fresh insert bump marketing_view_count.
CREATE OR REPLACE FUNCTION public.apply_course_video_marketing_growth_hour(
	p_video_id UUID,
	p_plan_date DATE,
	p_hour_slot SMALLINT,
	p_increment BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_inserted BOOLEAN := false;
	v_new_count BIGINT;
BEGIN
	IF p_hour_slot < 0 OR p_hour_slot > 23 THEN
		RAISE EXCEPTION 'hour_slot out of range';
	END IF;
	IF p_increment IS NULL OR p_increment < 0 THEN
		RAISE EXCEPTION 'increment must be non-negative';
	END IF;

	INSERT INTO public.course_video_marketing_growth_applies (
		video_id, plan_date, hour_slot, increment_applied
	)
	VALUES (p_video_id, p_plan_date, p_hour_slot, p_increment)
	ON CONFLICT (video_id, plan_date, hour_slot) DO NOTHING
	RETURNING true INTO v_inserted;

	IF v_inserted IS DISTINCT FROM true THEN
		SELECT cv.marketing_view_count INTO v_new_count
		FROM public.course_videos cv
		WHERE cv.id = p_video_id;

		RETURN jsonb_build_object(
			'applied', false,
			'marketing_view_count', v_new_count
		);
	END IF;

	IF p_increment > 0 THEN
		UPDATE public.course_videos
		SET marketing_view_count = marketing_view_count + p_increment,
			updated_at = NOW()
		WHERE id = p_video_id
		RETURNING marketing_view_count INTO v_new_count;
	ELSE
		SELECT cv.marketing_view_count INTO v_new_count
		FROM public.course_videos cv
		WHERE cv.id = p_video_id;
	END IF;

	RETURN jsonb_build_object(
		'applied', true,
		'marketing_view_count', v_new_count
	);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_course_video_marketing_growth_hour(UUID, DATE, SMALLINT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_course_video_marketing_growth_hour(UUID, DATE, SMALLINT, BIGINT) TO service_role;
