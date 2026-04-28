-- 管理后台：确保 public.admins 存在，并写入引导超级管理员（须与 src/lib/auth/bootstrap-super-admin.ts 邮箱一致）
-- 与 supabase/admin_auth_students.sql 语义一致，便于 supabase db push 自动落地。

DO $$
BEGIN
	CREATE TYPE public.admin_role AS ENUM ('super_admin', 'admin');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.admins (
	email TEXT PRIMARY KEY,
	role public.admin_role NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	created_by TEXT NULL
);

CREATE INDEX IF NOT EXISTS admins_role_idx ON public.admins (role);

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

INSERT INTO public.admins (email, role, created_by)
VALUES ('mark@hkfac.com', 'super_admin', NULL)
ON CONFLICT (email) DO UPDATE
SET
	role = excluded.role;
