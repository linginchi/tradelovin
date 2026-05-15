-- 阶梯升级：记录会员降级缓冲期起始时间

ALTER TABLE public.user_memberships
  ADD COLUMN IF NOT EXISTS grace_started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS user_memberships_grace_started_at_idx
  ON public.user_memberships(grace_started_at)
  WHERE grace_started_at IS NOT NULL;
