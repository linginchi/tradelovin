-- 视频分析仪表盘：analytics 角色支持
-- 扩展 admin_role ENUM 类型，添加 analytics
-- 日期: 2026-06-23

DO $$
BEGIN
  ALTER TYPE public.admin_role ADD VALUE 'analytics';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
