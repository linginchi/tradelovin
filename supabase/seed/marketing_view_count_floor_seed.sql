-- REVIEW ONLY — do not run automatically.
-- marketing_view_count floor seed + 豹哥 Leo baseline (Approach A).
-- Deploy code with BOOSTED_MARKETING_VIDEO_ID first, then run this SQL,
-- then delete today's HK plans/applies BEFORE the next marketing-growth cron.

-- 1) Non-boost videos: GREATEST(view_count, partition floor) when still at 0.
--    Floors: 交易经典 (topic sort_order=10) >= 1800; 录播教学 (=20) >= 1200; else >= 800.
UPDATE public.course_videos cv
SET marketing_view_count = GREATEST(cv.view_count, seeded.floor_value)
FROM (
  SELECT
    v.id,
    CASE
      WHEN ct.sort_order = 10 THEN 1800
      WHEN ct.sort_order = 20 THEN 1200
      ELSE 800
    END AS floor_value
  FROM public.course_videos v
  JOIN public.courses c ON c.id = v.course_id
  LEFT JOIN public.course_topics ct ON ct.id = c.topic_id
  WHERE v.id <> '7e742344-5a40-471e-b2ea-53e8553702df'
    AND v.marketing_view_count = 0
) seeded
WHERE cv.id = seeded.id;

-- 2) 豹哥·交易新銳 — 尼克·李森 fixed baseline (always set for review run).
UPDATE public.course_videos
SET marketing_view_count = 3589
WHERE id = '7e742344-5a40-471e-b2ea-53e8553702df';

-- 3) Invalidate today's HK growth plans so cron rebuilds with new baselines + BOOST 1.2× rule.
-- Replace :hk_today with Asia/Hong_Kong YYYY-MM-DD at execution time.
DELETE FROM public.course_video_marketing_growth_applies
WHERE plan_date = :hk_today;

DELETE FROM public.course_video_marketing_growth_plans
WHERE plan_date = :hk_today;
