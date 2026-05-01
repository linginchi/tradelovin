-- 指令 93：会员状态定时任务（pg_cron）

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron extension unavailable: %', SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION public.instruction93_expire_memberships()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_memberships
  SET
    status = 'expired',
    updated_at = NOW()
  WHERE status = 'active'
    AND cancel_at_period_end = false
    AND current_period_end < NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.instruction93_expire_trials()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_memberships
  SET
    plan = 'T0_paid',
    status = 'expired',
    trial_end = NULL,
    current_period_start = NOW(),
    current_period_end = NOW(),
    updated_at = NOW()
  WHERE plan = 'T0_trial'
    AND trial_end IS NOT NULL
    AND trial_end < NOW();
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'instruction93-expire-memberships') THEN
      PERFORM cron.unschedule((SELECT jobid FROM cron.job WHERE jobname = 'instruction93-expire-memberships' LIMIT 1));
    END IF;

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'instruction93-expire-trials') THEN
      PERFORM cron.unschedule((SELECT jobid FROM cron.job WHERE jobname = 'instruction93-expire-trials' LIMIT 1));
    END IF;

    PERFORM cron.schedule(
      'instruction93-expire-memberships',
      '0 0 * * *',
      'SELECT public.instruction93_expire_memberships();'
    );

    PERFORM cron.schedule(
      'instruction93-expire-trials',
      '0 1 * * *',
      'SELECT public.instruction93_expire_trials();'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'cron.schedule skipped: %', SQLERRM;
END $$;
