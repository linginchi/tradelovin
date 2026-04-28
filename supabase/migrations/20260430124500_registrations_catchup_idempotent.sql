-- 与一键注册 / enroll 对齐：确保 registrations 含 status、user_id 及 RLS。
-- 若项目已应用 20260430121800、20260430122000，本文件多为 no-op（IF NOT EXISTS / DROP POLICY IF EXISTS）。
-- 回填 user_id：用 auth.users.email（profiles 可能已无 email 列）。

ALTER TABLE public.registrations
	ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

ALTER TABLE public.registrations
	ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users (id) ON DELETE CASCADE;

COMMENT ON COLUMN public.registrations.user_id IS '报名人（需已登录）；与 auth.users.id 对齐';

UPDATE public.registrations r
SET user_id = u.id
FROM auth.users u
WHERE
	r.user_id IS NULL
	AND r.email IS NOT NULL
	AND u.email IS NOT NULL
	AND lower(trim(r.email)) = lower(trim(u.email::text));

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

DROP POLICY IF EXISTS "Allow anonymous insert on registrations" ON public.registrations;

DROP POLICY IF EXISTS "Allow users read own registrations" ON public.registrations;

DROP POLICY IF EXISTS "Allow users insert own registrations" ON public.registrations;

DROP POLICY IF EXISTS "Allow users select own registrations" ON public.registrations;

DROP POLICY IF EXISTS "Allow users update own registrations" ON public.registrations;

CREATE POLICY "Allow users insert own registrations" ON public.registrations FOR INSERT TO authenticated
	WITH CHECK (user_id = auth.uid ());

CREATE POLICY "Allow users select own registrations" ON public.registrations FOR SELECT TO authenticated USING (user_id = auth.uid ());

CREATE POLICY "Allow users update own registrations" ON public.registrations FOR UPDATE TO authenticated USING (user_id = auth.uid ())
	WITH CHECK (user_id = auth.uid ());
