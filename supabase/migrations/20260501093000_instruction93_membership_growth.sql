-- 指令 93：会员体系（T0-T3）+ 积分 + 支付订阅 + 推荐激励 + CPS

CREATE TABLE IF NOT EXISTS public.user_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  plan TEXT NOT NULL CHECK (plan IN ('T0_trial', 'T0_paid', 'T1', 'T2', 'T3')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled', 'trialing', 'paused')),
  trial_end TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 day'),
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  billing_cycle TEXT CHECK (billing_cycle IN ('month', 'year')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_memberships_user_id_idx ON public.user_memberships(user_id);
CREATE INDEX IF NOT EXISTS user_memberships_plan_idx ON public.user_memberships(plan);
CREATE INDEX IF NOT EXISTS user_memberships_status_idx ON public.user_memberships(status);
CREATE UNIQUE INDEX IF NOT EXISTS user_memberships_stripe_subscription_id_uidx
  ON public.user_memberships(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  amount DECIMAL(10,2),
  currency TEXT NOT NULL DEFAULT 'CNY',
  plan TEXT,
  payment_method TEXT,
  transaction_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT NOT NULL DEFAULT 'stripe',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payments_user_id_idx ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON public.payments(status);
CREATE INDEX IF NOT EXISTS payments_created_at_idx ON public.payments(created_at DESC);

CREATE TABLE IF NOT EXISTS public.user_points (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance INT NOT NULL DEFAULT 0,
  total_earned INT NOT NULL DEFAULT 0,
  total_spent INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.points_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('earn', 'spend')),
  reason TEXT,
  reference_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS points_transactions_user_id_idx ON public.points_transactions(user_id);
CREATE INDEX IF NOT EXISTS points_transactions_reason_idx ON public.points_transactions(reason);
CREATE INDEX IF NOT EXISTS points_transactions_created_at_idx ON public.points_transactions(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS points_transactions_unique_ref_idx
  ON public.points_transactions(user_id, type, reason, reference_id)
  WHERE reference_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  referee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed_auth', 'completed_payment')),
  reward_granted BOOLEAN NOT NULL DEFAULT false,
  referee_first_payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS referrals_referrer_id_idx ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS referrals_referee_id_idx ON public.referrals(referee_id);
CREATE INDEX IF NOT EXISTS referrals_status_idx ON public.referrals(status);

CREATE TABLE IF NOT EXISTS public.course_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  course_url TEXT,
  click_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  conversion_status TEXT NOT NULL DEFAULT 'pending' CHECK (conversion_status IN ('pending', 'converted', 'failed')),
  commission_amount DECIMAL(10,2),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS course_clicks_user_id_idx ON public.course_clicks(user_id);
CREATE INDEX IF NOT EXISTS course_clicks_conversion_status_idx ON public.course_clicks(conversion_status);

CREATE TABLE IF NOT EXISTS public.redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  reward_type TEXT NOT NULL,
  points_cost INT NOT NULL CHECK (points_cost > 0),
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'cancelled')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS redemptions_user_id_idx ON public.redemptions(user_id);
CREATE INDEX IF NOT EXISTS redemptions_status_idx ON public.redemptions(status);

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, event_id)
);

CREATE INDEX IF NOT EXISTS webhook_events_processed_idx ON public.webhook_events(processed);
CREATE INDEX IF NOT EXISTS webhook_events_event_type_idx ON public.webhook_events(event_type);

CREATE TABLE IF NOT EXISTS public.tq_advice_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  condition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  advice_template TEXT NOT NULL,
  course_hint TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.tq_advice_templates(key, title, condition_json, advice_template, course_hint)
VALUES
  (
    'win_ratio_low',
    '胜率偏低',
    '{"feature":"WinRatio","op":"lt","value":40}'::jsonb,
    '您的盈利笔数偏低，建议学习《提高胜率》课程，并减少随意开仓。',
    '提高胜率'
  ),
  (
    'max_drawdown_high',
    '最大回撤偏高',
    '{"feature":"MaxDrawDown","op":"gt","value":15}'::jsonb,
    '您的最大回撤较大，请加强止损纪律，并限制单日最大亏损。',
    '风险控制与仓位管理'
  )
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.instruction93_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_instruction93_user_memberships_updated_at ON public.user_memberships;
CREATE TRIGGER trg_instruction93_user_memberships_updated_at
BEFORE UPDATE ON public.user_memberships
FOR EACH ROW
EXECUTE FUNCTION public.instruction93_set_updated_at();

DROP TRIGGER IF EXISTS trg_instruction93_tq_advice_templates_updated_at ON public.tq_advice_templates;
CREATE TRIGGER trg_instruction93_tq_advice_templates_updated_at
BEFORE UPDATE ON public.tq_advice_templates
FOR EACH ROW
EXECUTE FUNCTION public.instruction93_set_updated_at();

CREATE OR REPLACE FUNCTION public.instruction93_initialize_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_memberships (
    user_id,
    plan,
    status,
    trial_end,
    current_period_start,
    current_period_end
  )
  VALUES (
    NEW.id,
    'T0_trial',
    'trialing',
    NOW() + INTERVAL '14 day',
    NOW(),
    NOW() + INTERVAL '14 day'
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_points(user_id, balance, total_earned, total_spent, updated_at)
  VALUES (NEW.id, 0, 0, 0, NOW())
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_instruction93_member ON auth.users;
CREATE TRIGGER on_auth_user_created_instruction93_member
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.instruction93_initialize_member();

INSERT INTO public.user_memberships (
  user_id,
  plan,
  status,
  trial_end,
  current_period_start,
  current_period_end
)
SELECT
  u.id,
  'T0_paid',
  'expired',
  NULL,
  COALESCE(u.created_at, NOW()),
  COALESCE(u.created_at, NOW())
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.user_points(user_id, balance, total_earned, total_spent, updated_at)
SELECT u.id, 0, 0, 0, NOW()
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.user_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tq_advice_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_memberships_own_select ON public.user_memberships;
CREATE POLICY user_memberships_own_select ON public.user_memberships
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS payments_own_select ON public.payments;
CREATE POLICY payments_own_select ON public.payments
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_points_own_select ON public.user_points;
CREATE POLICY user_points_own_select ON public.user_points
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS points_transactions_own_select ON public.points_transactions;
CREATE POLICY points_transactions_own_select ON public.points_transactions
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS referrals_own_select ON public.referrals;
CREATE POLICY referrals_own_select ON public.referrals
FOR SELECT TO authenticated
USING (referrer_id = auth.uid() OR referee_id = auth.uid());

DROP POLICY IF EXISTS course_clicks_own_select ON public.course_clicks;
CREATE POLICY course_clicks_own_select ON public.course_clicks
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS redemptions_own_select ON public.redemptions;
CREATE POLICY redemptions_own_select ON public.redemptions
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS tq_advice_templates_read_all ON public.tq_advice_templates;
CREATE POLICY tq_advice_templates_read_all ON public.tq_advice_templates
FOR SELECT TO authenticated
USING (enabled = true);
