-- 指令95 P0：操作练习积分与日志表

CREATE TABLE IF NOT EXISTS public.practice_scores (
	user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
	total_score INT NOT NULL DEFAULT 0,
	completed_levels JSONB NOT NULL DEFAULT '[]'::jsonb,
	last_practice TIMESTAMPTZ,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.practice_logs (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
	level_id TEXT NOT NULL,
	step_id TEXT NOT NULL,
	user_input JSONB,
	correct BOOLEAN,
	score_delta INT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS practice_logs_user_created_idx
ON public.practice_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS practice_logs_level_step_idx
ON public.practice_logs(level_id, step_id, created_at DESC);

ALTER TABLE public.practice_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS practice_scores_own_all ON public.practice_scores;
CREATE POLICY practice_scores_own_all
ON public.practice_scores
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS practice_logs_own_read_insert ON public.practice_logs;
CREATE POLICY practice_logs_own_read_insert
ON public.practice_logs
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS practice_logs_own_insert ON public.practice_logs;
CREATE POLICY practice_logs_own_insert
ON public.practice_logs
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());
