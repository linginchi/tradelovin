-- 指令99 P4：practice_scores 增加豹成长阶段字段
ALTER TABLE public.practice_scores
ADD COLUMN IF NOT EXISTS current_stage TEXT NOT NULL DEFAULT 'cub';
