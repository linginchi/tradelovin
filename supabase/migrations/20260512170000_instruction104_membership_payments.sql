-- 指令 104：Stripe 订阅 + FPS 手动转账

ALTER TABLE public.user_memberships
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS public.manual_payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  order_no TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('T1', 'T2', 'T3')),
  period TEXT NOT NULL CHECK (period IN ('monthly', 'yearly')),
  amount DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'pending_approval', 'paid', 'expired', 'cancelled')),
  proof_image_url TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS manual_payment_orders_user_id_idx
  ON public.manual_payment_orders(user_id);
CREATE INDEX IF NOT EXISTS manual_payment_orders_status_idx
  ON public.manual_payment_orders(status);
CREATE INDEX IF NOT EXISTS manual_payment_orders_created_at_idx
  ON public.manual_payment_orders(created_at DESC);

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  order_id TEXT,
  gateway TEXT NOT NULL CHECK (gateway IN ('stripe', 'manual')),
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'HKD',
  status TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_transactions_user_id_idx
  ON public.payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS payment_transactions_gateway_idx
  ON public.payment_transactions(gateway);
CREATE INDEX IF NOT EXISTS payment_transactions_created_at_idx
  ON public.payment_transactions(created_at DESC);

ALTER TABLE public.manual_payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS manual_payment_orders_own_select ON public.manual_payment_orders;
CREATE POLICY manual_payment_orders_own_select ON public.manual_payment_orders
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS manual_payment_orders_own_insert ON public.manual_payment_orders;
CREATE POLICY manual_payment_orders_own_insert ON public.manual_payment_orders
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS manual_payment_orders_own_update ON public.manual_payment_orders;
CREATE POLICY manual_payment_orders_own_update ON public.manual_payment_orders
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS manual_payment_orders_service_role_all ON public.manual_payment_orders;
CREATE POLICY manual_payment_orders_service_role_all ON public.manual_payment_orders
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS payment_transactions_own_select ON public.payment_transactions;
CREATE POLICY payment_transactions_own_select ON public.payment_transactions
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS payment_transactions_service_role_all ON public.payment_transactions;
CREATE POLICY payment_transactions_service_role_all ON public.payment_transactions
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.instruction104_expire_trials()
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
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'instruction104-expire-trials') THEN
      PERFORM cron.unschedule((SELECT jobid FROM cron.job WHERE jobname = 'instruction104-expire-trials' LIMIT 1));
    END IF;
    PERFORM cron.schedule(
      'instruction104-expire-trials',
      '30 0 * * *',
      'SELECT public.instruction104_expire_trials();'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'instruction104 cron schedule skipped: %', SQLERRM;
END $$;
