-- 指令100 P5：练习日志分析查询索引
CREATE INDEX IF NOT EXISTS practice_logs_correct_created_idx
ON public.practice_logs(correct, created_at DESC);

CREATE INDEX IF NOT EXISTS practice_logs_level_created_idx
ON public.practice_logs(level_id, created_at DESC);
