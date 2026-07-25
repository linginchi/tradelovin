-- 观看人次改为每次播放都计数（含游客）
-- 日期: 2026-06-17

-- 移除 video_view_log 的唯一约束（允许重复记录）
ALTER TABLE public.video_view_log DROP CONSTRAINT IF EXISTS video_view_log_video_id_user_id_key;

-- user_id 改为可空（游客无 user_id）
ALTER TABLE public.video_view_log ALTER COLUMN user_id DROP NOT NULL;
