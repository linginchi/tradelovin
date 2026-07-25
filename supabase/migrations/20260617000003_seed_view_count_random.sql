-- 为所有视频设置随机起始观看人次（高四位数，每个视频不同）
-- 日期: 2026-06-17

-- 使用 postgres random() 生成 5000-9999 范围内的随机整数
UPDATE public.course_videos
SET view_count = 5000 + floor(random() * 5000)::int
WHERE view_count = 0;
