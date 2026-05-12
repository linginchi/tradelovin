-- 指令98 P3：practice_logs / practice_scores 细化 RLS 策略

ALTER TABLE public.practice_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS practice_logs_own_read_insert ON public.practice_logs;
DROP POLICY IF EXISTS practice_logs_own_insert ON public.practice_logs;
DROP POLICY IF EXISTS "Users can insert own practice logs" ON public.practice_logs;
DROP POLICY IF EXISTS "Users can view own practice logs" ON public.practice_logs;

CREATE POLICY "Users can insert own practice logs"
ON public.practice_logs
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own practice logs"
ON public.practice_logs
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS practice_scores_own_all ON public.practice_scores;
DROP POLICY IF EXISTS "Users can view own practice scores" ON public.practice_scores;
DROP POLICY IF EXISTS "Users can update own practice scores" ON public.practice_scores;
DROP POLICY IF EXISTS "Users can insert own practice scores" ON public.practice_scores;

CREATE POLICY "Users can view own practice scores"
ON public.practice_scores
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can update own practice scores"
ON public.practice_scores
FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own practice scores"
ON public.practice_scores
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());
