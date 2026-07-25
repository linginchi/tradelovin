-- Course topic grouping for the existing public.courses table.
-- Deleting a topic intentionally preserves its courses and clears topic_id.

CREATE TABLE IF NOT EXISTS public.course_topics (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	title TEXT NOT NULL CHECK (char_length(btrim(title)) > 0),
	description TEXT,
	sort_order INTEGER NOT NULL DEFAULT 0,
	is_active BOOLEAN NOT NULL DEFAULT true,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.courses
	ADD COLUMN IF NOT EXISTS topic_id UUID REFERENCES public.course_topics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS courses_topic_id_idx ON public.courses(topic_id);

ALTER TABLE public.course_topics ENABLE ROW LEVEL SECURITY;
