-- 讲师后台使用 profiles.role = 'instructor'；放宽与 admin_operations 中旧约束的冲突。
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
	ADD CONSTRAINT profiles_role_check CHECK (
		role IN ('user', 'admin', 'super_admin', 'instructor')
	);
