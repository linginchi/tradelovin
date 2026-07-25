-- 管理后台：补充引导超级管理员 mark@hkfac.org（与 mark@hkfac.com 同为超管）。
-- 须与 src/lib/auth/admin-portal-constants.ts 中 BOOTSTRAP_SUPER_ADMIN_EMAILS 一致。
-- 幂等：已存在则提升为 super_admin。

INSERT INTO public.admins (email, role, created_by)
VALUES ('mark@hkfac.org', 'super_admin', NULL)
ON CONFLICT (email) DO UPDATE
SET
	role = excluded.role;
