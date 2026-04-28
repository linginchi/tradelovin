-- =============================================================================
-- 完整数据库模式同步（可重复执行，幂等）
-- =============================================================================
--
-- 用途：空库、严重 schema 漂移、或无法使用 CLI 时的手工对齐。
-- 正常部署请优先：supabase db push（与 supabase/migrations 一致）。
--
-- 相对你提供的草案，本文件已修正：
--   • information_schema 查询均限定 table_schema = 'public'
--   • registrations.reviewed_by → public.profiles(id)（与后台审核 / getReviewerProfileId 一致）
--   • sim_accounts 含 initial_balance 及与应用的 CHECK/RLS（见 20260430121500）
--   • courses 含 instructor_id → profiles，并与三关迁移扩展列兼容
--   • 不 DROP 已有业务表，避免误删生产数据
--
-- 执行后：Dashboard → API 侧等待 PostgREST schema 刷新。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. profiles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
	id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'nickname') THEN
		ALTER TABLE public.profiles ADD COLUMN nickname TEXT;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'real_name') THEN
		ALTER TABLE public.profiles ADD COLUMN real_name TEXT;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'phone') THEN
		ALTER TABLE public.profiles ADD COLUMN phone TEXT;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'avatar_url') THEN
		ALTER TABLE public.profiles ADD COLUMN avatar_url TEXT;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'trading_experience') THEN
		ALTER TABLE public.profiles ADD COLUMN trading_experience TEXT;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'trading_style_preferences') THEN
		ALTER TABLE public.profiles ADD COLUMN trading_style_preferences TEXT[];
	END IF;
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'learning_goals') THEN
		ALTER TABLE public.profiles ADD COLUMN learning_goals TEXT;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'willing_to_recommend') THEN
		ALTER TABLE public.profiles ADD COLUMN willing_to_recommend BOOLEAN;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role') THEN
		ALTER TABLE public.profiles ADD COLUMN role TEXT DEFAULT 'user';
	END IF;
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'student_id') THEN
		ALTER TABLE public.profiles ADD COLUMN student_id TEXT;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'address') THEN
		ALTER TABLE public.profiles ADD COLUMN address TEXT;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'emergency_phone') THEN
		ALTER TABLE public.profiles ADD COLUMN emergency_phone TEXT;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'bio') THEN
		ALTER TABLE public.profiles ADD COLUMN bio TEXT;
	END IF;
	-- 可选列（应用当前不写入，仅兼容旧脚本/后台）
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_instructor') THEN
		ALTER TABLE public.profiles ADD COLUMN is_instructor BOOLEAN DEFAULT false;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'specialties') THEN
		ALTER TABLE public.profiles ADD COLUMN specialties TEXT[] DEFAULT '{}';
	END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_student_id_unique ON public.profiles (student_id)
WHERE
	student_id IS NOT NULL;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- -----------------------------------------------------------------------------
-- 2. registrations（学员报名表；reviewed_by → profiles）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.registrations (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	email TEXT,
	nickname TEXT NOT NULL,
	trading_experience TEXT NOT NULL,
	trading_style_preferences TEXT[] NOT NULL DEFAULT '{}',
	learning_goals TEXT,
	willing_to_recommend BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS real_name TEXT;

ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS student_id TEXT;

ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name = 'reviewed_by') THEN
		ALTER TABLE public.registrations ADD COLUMN reviewed_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL;
	END IF;
END $$;

DO $$
BEGIN
	ALTER TABLE public.registrations DROP CONSTRAINT IF EXISTS registrations_email_key;

	ALTER TABLE public.registrations DROP CONSTRAINT IF EXISTS registrations_email_unique;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DROP INDEX IF EXISTS registrations_email_unique;

CREATE UNIQUE INDEX IF NOT EXISTS registrations_user_id_unique ON public.registrations (user_id)
WHERE
	user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_registrations_user_id ON public.registrations (user_id);

ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous insert on registrations" ON public.registrations;

DROP POLICY IF EXISTS "Allow users read own registrations" ON public.registrations;

DROP POLICY IF EXISTS "Allow users insert own registrations" ON public.registrations;

DROP POLICY IF EXISTS "Allow users select own registrations" ON public.registrations;

DROP POLICY IF EXISTS "Allow users update own registrations" ON public.registrations;

DROP POLICY IF EXISTS "Users can view own registrations" ON public.registrations;

CREATE POLICY "Allow users insert own registrations" ON public.registrations FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid ());

CREATE POLICY "Allow users select own registrations" ON public.registrations FOR SELECT TO authenticated USING (user_id = auth.uid ());

CREATE POLICY "Allow users update own registrations" ON public.registrations FOR UPDATE TO authenticated USING (user_id = auth.uid ())
	WITH CHECK (user_id = auth.uid ());

-- -----------------------------------------------------------------------------
-- 3. 模拟交易（与 migrations/20260430121500 + 216 对齐）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sim_accounts (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
	user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
	account_name TEXT NOT NULL DEFAULT '主账户',
	initial_balance NUMERIC(12, 2) NOT NULL DEFAULT 100000.00,
	current_balance NUMERIC(12, 2) NOT NULL DEFAULT 100000.00,
	frozen_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
	status TEXT NOT NULL DEFAULT 'active',
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 旧库若仅有 current_balance，补 initial_balance
ALTER TABLE public.sim_accounts ADD COLUMN IF NOT EXISTS initial_balance NUMERIC(12, 2);

UPDATE public.sim_accounts
SET
	initial_balance = COALESCE(initial_balance, current_balance, 100000.00)
WHERE
	initial_balance IS NULL;

ALTER TABLE public.sim_accounts ALTER COLUMN initial_balance SET DEFAULT 100000.00;

DO $$
BEGIN
	ALTER TABLE public.sim_accounts ALTER COLUMN initial_balance SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS sim_accounts_user_id_idx ON public.sim_accounts (user_id);

CREATE TABLE IF NOT EXISTS public.sim_positions (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
	account_id UUID NOT NULL REFERENCES public.sim_accounts (id) ON DELETE CASCADE,
	symbol TEXT NOT NULL,
	name TEXT,
	quantity INTEGER NOT NULL DEFAULT 0,
	available_qty INTEGER NOT NULL DEFAULT 0,
	frozen_qty INTEGER NOT NULL DEFAULT 0,
	cost_price NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
	market_value NUMERIC(12, 2) DEFAULT 0.00,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE (account_id, symbol)
);

CREATE INDEX IF NOT EXISTS sim_positions_account_id_idx ON public.sim_positions (account_id);

CREATE TABLE IF NOT EXISTS public.sim_orders (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
	account_id UUID NOT NULL REFERENCES public.sim_accounts (id) ON DELETE CASCADE,
	symbol TEXT NOT NULL,
	side TEXT NOT NULL,
	price NUMERIC(10, 4) NOT NULL,
	quantity INTEGER NOT NULL,
	filled_qty INTEGER NOT NULL DEFAULT 0,
	status TEXT NOT NULL DEFAULT 'pending',
	order_type TEXT NOT NULL DEFAULT 'limit',
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sim_orders ADD COLUMN IF NOT EXISTS reserved_cash NUMERIC(12, 2);

ALTER TABLE public.sim_orders ADD COLUMN IF NOT EXISTS reserved_shares INTEGER;

CREATE INDEX IF NOT EXISTS sim_orders_account_id_idx ON public.sim_orders (account_id);

CREATE TABLE IF NOT EXISTS public.sim_trades (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
	order_id UUID REFERENCES public.sim_orders (id) ON DELETE SET NULL,
	account_id UUID NOT NULL REFERENCES public.sim_accounts (id) ON DELETE CASCADE,
	symbol TEXT NOT NULL,
	side TEXT NOT NULL,
	price NUMERIC(10, 4) NOT NULL,
	quantity INTEGER NOT NULL,
	commission NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
	stamp_tax NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
	trade_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sim_trades_account_id_idx ON public.sim_trades (account_id);

ALTER TABLE public.sim_accounts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sim_positions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sim_orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sim_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sim_accounts_own_all ON public.sim_accounts;

CREATE POLICY sim_accounts_own_all ON public.sim_accounts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS sim_positions_via_account ON public.sim_positions;

CREATE POLICY sim_positions_via_account ON public.sim_positions FOR ALL TO authenticated USING (
	EXISTS (
		SELECT 1
		FROM public.sim_accounts a
		WHERE a.id = sim_positions.account_id
			AND a.user_id = auth.uid()
	)
)
WITH CHECK (
	EXISTS (
		SELECT 1
		FROM public.sim_accounts a
		WHERE a.id = sim_positions.account_id
			AND a.user_id = auth.uid()
	)
);

DROP POLICY IF EXISTS sim_orders_via_account ON public.sim_orders;

CREATE POLICY sim_orders_via_account ON public.sim_orders FOR ALL TO authenticated USING (
	EXISTS (
		SELECT 1
		FROM public.sim_accounts a
		WHERE a.id = sim_orders.account_id
			AND a.user_id = auth.uid()
	)
)
WITH CHECK (
	EXISTS (
		SELECT 1
		FROM public.sim_accounts a
		WHERE a.id = sim_orders.account_id
			AND a.user_id = auth.uid()
	)
);

DROP POLICY IF EXISTS sim_trades_via_account ON public.sim_trades;

CREATE POLICY sim_trades_via_account ON public.sim_trades FOR ALL TO authenticated USING (
	EXISTS (
		SELECT 1
		FROM public.sim_accounts a
		WHERE a.id = sim_trades.account_id
			AND a.user_id = auth.uid()
	)
)
WITH CHECK (
	EXISTS (
		SELECT 1
		FROM public.sim_accounts a
		WHERE a.id = sim_trades.account_id
			AND a.user_id = auth.uid()
	)
);

-- -----------------------------------------------------------------------------
-- 4. courses + 选课/成绩（与 admin_operations + 20260430123000 兼容）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.courses (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
	title TEXT NOT NULL,
	description TEXT,
	mode TEXT,
	capacity INT NOT NULL DEFAULT 30,
	instructor_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS cover_image TEXT;

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS instructor_label TEXT;

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS start_date DATE;

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS end_date DATE;

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS location TEXT;

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2);

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW ();

CREATE INDEX IF NOT EXISTS courses_title_idx ON public.courses (lower(title));

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active courses" ON public.courses;

CREATE POLICY "Anyone can view active courses" ON public.courses FOR SELECT TO anon, authenticated USING (is_active = true);

CREATE TABLE IF NOT EXISTS public.course_registrations (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
	user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
	course_id UUID NOT NULL REFERENCES public.courses (id) ON DELETE CASCADE,
	status TEXT NOT NULL DEFAULT 'pending',
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
		SELECT 1
		FROM public.course_registrations cr
		WHERE cr.id = course_scores.registration_id
			AND cr.user_id = auth.uid ()
	)
);

-- -----------------------------------------------------------------------------
-- 5. 求职（与 20260430122100 + 230 一致：旧名 career_applications 可重命名）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_applications (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
	user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
	target_company TEXT,
	target_role TEXT,
	salary_expectation TEXT,
	location_preference TEXT,
	note TEXT,
	status TEXT NOT NULL DEFAULT 'pending',
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
);

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'career_applications')
		AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_applications') THEN
		ALTER TABLE public.career_applications RENAME TO job_applications;
	END IF;
END $$;

ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS resume_url TEXT;

CREATE INDEX IF NOT EXISTS job_applications_user_id_idx ON public.job_applications (user_id);

CREATE TABLE IF NOT EXISTS public.job_progress (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
	application_id UUID NOT NULL REFERENCES public.job_applications (id) ON DELETE CASCADE,
	step TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending',
	notes TEXT,
	updated_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
	UNIQUE (application_id, step)
);

CREATE INDEX IF NOT EXISTS job_progress_application_idx ON public.job_progress (application_id);

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.job_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own career application" ON public.job_applications;

CREATE POLICY "Users manage own career application" ON public.job_applications FOR ALL TO authenticated USING (user_id = auth.uid ())
WITH CHECK (user_id = auth.uid ());

DROP POLICY IF EXISTS "Users view own job progress" ON public.job_progress;

CREATE POLICY "Users view own job progress" ON public.job_progress FOR SELECT TO authenticated USING (
	EXISTS (
		SELECT 1
		FROM public.job_applications ja
		WHERE ja.id = job_progress.application_id
			AND ja.user_id = auth.uid ()
	)
);
