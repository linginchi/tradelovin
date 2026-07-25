-- 观看人次日增写入日志（幂等：每个日历日只跑一次）
CREATE TABLE IF NOT EXISTS public.view_count_bump_log (
  bump_date DATE PRIMARY KEY,
  total_added INTEGER NOT NULL DEFAULT 0,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.view_count_bump_log ENABLE ROW LEVEL SECURITY;
