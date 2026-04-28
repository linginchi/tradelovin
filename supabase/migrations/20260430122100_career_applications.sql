-- 第三关·求职意向（占位，管理员后续从后台读取）
CREATE TABLE IF NOT EXISTS public.career_applications (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
	user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
	target_company TEXT,
	target_role TEXT,
	salary_expectation TEXT,
	location_preference TEXT,
	note TEXT,
	status TEXT NOT NULL DEFAULT 'pending' CHECK (
		status IN ('pending', 'reviewing', 'approved', 'rejected')
	),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS career_applications_user_id_idx ON public.career_applications (user_id);

ALTER TABLE public.career_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own career application" ON public.career_applications FOR ALL TO authenticated USING (user_id = auth.uid ())
WITH CHECK (user_id = auth.uid ());
