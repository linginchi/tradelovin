-- 与线上表结构对齐：移除可选的 course_id（若曾存在）
ALTER TABLE public.recruiting_info DROP COLUMN IF EXISTS course_id;
