-- 业务已迁移到 course_teaser，清理旧的 recruiting_info 相关对象
DROP TABLE IF EXISTS public.recruiting_info CASCADE;
