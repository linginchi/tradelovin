-- 三关流程：邮箱 OTP 表、课程报名/成绩、求职进度；扩展 courses；career_applications -> job_applications

-- ---- 用户邮箱 OTP（仅服务端 service role 写入；无用户侧 policy）----
CREATE TABLE IF NOT EXISTS public.email_verification_codes (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
	email TEXT NOT NULL,
	code_hash TEXT NOT NULL,
	intent TEXT NOT NULL CHECK (intent IN ('register', 'login')),
	expires_at TIMESTAMPTZ NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
);

CREATE INDEX IF NOT EXISTS email_verification_codes_email_intent_idx ON public.email_verification_codes (lower(email), intent, expires_at DESC);

ALTER TABLE public.email_verification_codes ENABLE ROW LEVEL SECURITY;

-- ---- courses 扩展字段（与现有 instructor_id 并存）----
DO $$
BEGIN
	IF EXISTS (
		SELECT
			1
		FROM
			information_schema.tables
		WHERE
			table_schema = 'public'
			AND table_name = 'courses'
	) THEN
		ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS cover_image TEXT;

		ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS instructor_label TEXT;

		ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS start_date DATE;

		ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS end_date DATE;

		ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS location TEXT;

		ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2);

		ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

		ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW ();
	END IF;
END
$$;

-- ---- 课程报名（用户 -> 课程；依赖 courses 表已存在）----
CREATE TABLE IF NOT EXISTS public.course_registrations (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
	user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
	course_id UUID NOT NULL REFERENCES public.courses (id) ON DELETE CASCADE,
	status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
	applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
	reviewed_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
	reviewed_at TIMESTAMPTZ,
	notes TEXT,
	UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS course_registrations_course_idx ON public.course_registrations (course_id);

CREATE INDEX IF NOT EXISTS course_registrations_user_idx ON public.course_registrations (user_id);

ALTER TABLE public.course_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own course registrations" ON public.course_registrations;

CREATE POLICY "Users can view own course registrations" ON public.course_registrations FOR SELECT TO authenticated USING (user_id = auth.uid ());

DROP POLICY IF EXISTS "Users can insert own course registrations" ON public.course_registrations;

CREATE POLICY "Users can insert own course registrations" ON public.course_registrations FOR INSERT TO authenticated
WITH
	CHECK (user_id = auth.uid ());

-- ---- 课程成绩 ----
CREATE TABLE IF NOT EXISTS public.course_scores (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
	registration_id UUID NOT NULL REFERENCES public.course_registrations (id) ON DELETE CASCADE,
	score NUMERIC(5, 2),
	grade TEXT,
	certificate_url TEXT,
	uploaded_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
	uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
	comment TEXT
);

CREATE INDEX IF NOT EXISTS course_scores_registration_idx ON public.course_scores (registration_id);

ALTER TABLE public.course_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own course scores" ON public.course_scores;

CREATE POLICY "Users can view own course scores" ON public.course_scores FOR SELECT TO authenticated USING (
	EXISTS (
		SELECT
			1
		FROM
			public.course_registrations cr
		WHERE
			cr.id = course_scores.registration_id
			AND cr.user_id = auth.uid ()
	)
);

-- ---- 公开可读：激活课程 ----
DROP POLICY IF EXISTS "Anyone can view active courses" ON public.courses;

CREATE POLICY "Anyone can view active courses" ON public.courses FOR SELECT TO anon, authenticated USING (is_active = true);

-- ---- 求职：重命名表 ----
DO $$
BEGIN
	IF EXISTS (
		SELECT
			1
		FROM
			information_schema.tables
		WHERE
			table_schema = 'public'
			AND table_name = 'career_applications'
	) THEN
		ALTER TABLE public.career_applications RENAME TO job_applications;
	END IF;
END
$$;

ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS resume_url TEXT;

-- ---- 求职进度 ----
CREATE TABLE IF NOT EXISTS public.job_progress (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
	application_id UUID NOT NULL REFERENCES public.job_applications (id) ON DELETE CASCADE,
	step TEXT NOT NULL CHECK (
		step IN (
			'resume_screening',
			'interview',
			'assessment',
			'offer',
			'onboarded'
		)
	),
	status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected')),
	notes TEXT,
	updated_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
	UNIQUE (application_id, step)
);

CREATE INDEX IF NOT EXISTS job_progress_application_idx ON public.job_progress (application_id);

ALTER TABLE public.job_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own job progress" ON public.job_progress;

CREATE POLICY "Users view own job progress" ON public.job_progress FOR SELECT TO authenticated USING (
	EXISTS (
		SELECT
			1
		FROM
			public.job_applications ja
		WHERE
			ja.id = job_progress.application_id
			AND ja.user_id = auth.uid ()
	)
);

-- 已有申请：补一条初始进度（可选）
INSERT INTO public.job_progress (application_id, step, status)
SELECT
	ja.id,
	'resume_screening',
	'pending'
FROM
	public.job_applications ja
WHERE
	NOT EXISTS (
		SELECT
			1
		FROM
			public.job_progress jp
		WHERE
			jp.application_id = ja.id
	);

-- 证书文件（Service Role 上传；私有桶）
INSERT INTO
	storage.buckets (id, name, public)
SELECT
	'course-certificates',
	'course-certificates',
	false
WHERE
	NOT EXISTS (
		SELECT
			1
		FROM
			storage.buckets
		WHERE
			id = 'course-certificates'
	);
