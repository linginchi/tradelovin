-- 若尚未执行 admin_operations.sql 中的同名列，可单独执行本段。
-- 远端环境可能尚不存在 student_courses，需兼容跳过。
DO $$
BEGIN
	IF to_regclass('public.student_courses') IS NOT NULL THEN
		EXECUTE 'ALTER TABLE public.student_courses ADD COLUMN IF NOT EXISTS refund_reason text';
	END IF;
END $$;
