-- 报名与用户关联（第二关）；单用户仅一条 enrollment 记录（user_id 唯一）

ALTER TABLE public.registrations
	ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users (id) ON DELETE CASCADE;

COMMENT ON COLUMN public.registrations.user_id IS '报名人（需已登录）；与 auth.users.id 对齐';

-- 使用 profiles.email（若存在）或 auth.users.email 回填历史记录的 user_id（无匹配则保持 NULL）
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'profiles'
			AND column_name = 'email'
	) THEN
		UPDATE public.registrations r
		SET user_id = p.id
		FROM public.profiles p
		WHERE
			r.user_id IS NULL
			AND p.email IS NOT NULL
			AND r.email IS NOT NULL
			AND lower(trim(r.email)) = lower(trim(p.email));
	ELSE
		UPDATE public.registrations r
		SET user_id = au.id
		FROM auth.users au
		WHERE
			r.user_id IS NULL
			AND au.email IS NOT NULL
			AND r.email IS NOT NULL
			AND lower(trim(r.email)) = lower(trim(au.email));
	END IF;
END $$;

-- 若历史数据存在多条相同 email（旧匿名报名），仅在已关联 user_id 后可能冲突；
-- user_id 唯一索引仅对有值的行生效，便于逐步清理 NULL 行。
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

-- 收紧 RLS：仅登录用户可自行插入/读取本人报名记录（服务端仍可用 service_role）
DROP POLICY IF EXISTS "Allow anonymous insert on registrations" ON public.registrations;

DROP POLICY IF EXISTS "Allow users read own registrations" ON public.registrations;

DROP POLICY IF EXISTS "Allow users insert own registrations" ON public.registrations;

CREATE POLICY "Allow users insert own registrations" ON public.registrations FOR INSERT TO authenticated
	WITH CHECK (user_id = auth.uid ());

CREATE POLICY "Allow users select own registrations" ON public.registrations FOR SELECT TO authenticated USING (user_id = auth.uid ());

CREATE POLICY "Allow users update own registrations" ON public.registrations FOR UPDATE TO authenticated USING (user_id = auth.uid ())
	WITH CHECK (user_id = auth.uid ());
