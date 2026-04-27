-- 首页静态预告卡片（后台可编辑）
CREATE TABLE IF NOT EXISTS public.course_teaser (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	content TEXT NOT NULL,
	is_active BOOLEAN NOT NULL DEFAULT true,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS course_teaser_active_updated_idx
	ON public.course_teaser (is_active, updated_at DESC);

ALTER TABLE public.course_teaser ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS course_teaser_select_public ON public.course_teaser;

CREATE POLICY course_teaser_select_public
	ON public.course_teaser
	FOR SELECT
	TO anon, authenticated
	USING (true);

INSERT INTO public.course_teaser (content, is_active)
SELECT '新一起的干货课程，敬请期待', true
WHERE NOT EXISTS (SELECT 1 FROM public.course_teaser LIMIT 1);
