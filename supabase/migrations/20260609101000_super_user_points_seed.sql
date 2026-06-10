-- 超级用户 549516157@qq.com 积分设为 100 万（幂等）

DO $$
DECLARE
  v_user_id UUID;
  v_ref TEXT := 'super-user-seed-1000000';
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = '549516157@qq.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Super user 549516157@qq.com not found; skipping points seed';
    RETURN;
  END IF;

  INSERT INTO public.user_points (user_id, balance, total_earned, total_spent)
  VALUES (v_user_id, 1000000, 1000000, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = 1000000,
      total_earned = GREATEST(public.user_points.total_earned, 1000000),
      updated_at = NOW();

  IF NOT EXISTS (
    SELECT 1 FROM public.points_transactions
    WHERE user_id = v_user_id AND reference_id = v_ref
  ) THEN
    INSERT INTO public.points_transactions (user_id, amount, type, reason, reference_id, metadata)
    VALUES (v_user_id, 1000000, 'earn', 'admin_adjust', v_ref, '{"note":"super user seed"}'::jsonb);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tq_points_ledger
    WHERE user_id = v_user_id AND reference_id = v_ref
  ) THEN
    INSERT INTO public.tq_points_ledger (user_id, change_type, source, delta, balance_after, reference_id, metadata)
    VALUES (v_user_id, 'adjust', 'admin_adjust', 1000000, 1000000, v_ref, '{"note":"super user seed"}'::jsonb);
  END IF;

  -- 确保 V2 会员为 T3 active，便于全功能使用
  INSERT INTO public.user_memberships (
    user_id, plan, status, trial_end, current_period_start, current_period_end
  )
  VALUES (
    v_user_id,
    'T3',
    'active',
    NULL,
    NOW(),
    NOW() + INTERVAL '100 years'
  )
  ON CONFLICT (user_id) DO UPDATE
  SET plan = 'T3',
      status = 'active',
      trial_end = NULL,
      current_period_end = NOW() + INTERVAL '100 years',
      updated_at = NOW();
END $$;
