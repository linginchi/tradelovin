-- 若尚未执行 admin_operations.sql 中的同名列，可单独执行本段
alter table public.student_courses add column if not exists refund_reason text;
