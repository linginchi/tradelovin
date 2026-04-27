-- 首页招生便利贴（后台可编辑）
CREATE TABLE IF NOT EXISTS public.recruiting_info (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	course_id UUID REFERENCES public.courses (id) ON DELETE SET NULL,
	title TEXT NOT NULL,
	description TEXT,
	start_date DATE,
	enrollment_url TEXT NOT NULL DEFAULT '/register',
	is_active BOOLEAN NOT NULL DEFAULT true,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recruiting_info_active_updated_idx
	ON public.recruiting_info (is_active, updated_at DESC);

ALTER TABLE public.recruiting_info ENABLE ROW LEVEL SECURITY;
