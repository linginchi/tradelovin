-- 修复：instruction93 初始回填将历史用户统一标记为 T0_paid/expired，导致未到 14 天用户被提前失去试用
-- 规则：仅恢复“无付费记录、无有效订阅、仍在注册后 14 天窗口内”的用户为 T0_trial/trialing

UPDATE public.user_memberships AS um
SET
  plan = 'T0_trial',
  status = 'trialing',
  trial_end = u.created_at + INTERVAL '14 day',
  current_period_start = u.created_at,
  current_period_end = u.created_at + INTERVAL '14 day',
  cancel_at_period_end = false,
  updated_at = NOW()
FROM auth.users AS u
WHERE um.user_id = u.id
  AND um.plan = 'T0_paid'
  AND um.status = 'expired'
  AND um.trial_end IS NULL
  AND um.stripe_subscription_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.payments AS p
    WHERE p.user_id = um.user_id
      AND p.status = 'paid'
  )
  AND u.created_at IS NOT NULL
  AND u.created_at + INTERVAL '14 day' > NOW();
