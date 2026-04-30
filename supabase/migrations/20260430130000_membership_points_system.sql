-- 用户会员等级 + 积分体系（T1/T2/T3）
-- 目标：
-- 1) 新用户默认 T1，7 天试用模拟交易
-- 2) 支持 T2/T3 权益开关
-- 3) 支持 TQ 积分流水与 T3 开通记录

CREATE TABLE IF NOT EXISTS public.membership_accounts (
	user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
	tier TEXT NOT NULL DEFAULT 'T1',
	status TEXT NOT NULL DEFAULT 'active',
	trial_start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	trial_end_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 day'),
	current_period_start TIMESTAMPTZ,
	current_period_end TIMESTAMPTZ,
	last_paid_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT membership_accounts_tier_check CHECK (tier IN ('T1', 'T2', 'T3')),
	CONSTRAINT membership_accounts_status_check CHECK (
		status IN ('active', 'paused', 'expired', 'trialing')
	),
	CONSTRAINT membership_accounts_trial_check CHECK (trial_end_at >= trial_start_at)
);

CREATE INDEX IF NOT EXISTS membership_accounts_tier_idx ON public.membership_accounts (tier);
CREATE INDEX IF NOT EXISTS membership_accounts_period_end_idx ON public.membership_accounts (current_period_end DESC);

CREATE TABLE IF NOT EXISTS public.membership_entitlements (
	user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
	sim_trading BOOLEAN NOT NULL DEFAULT false,
	tq_report BOOLEAN NOT NULL DEFAULT false,
	l2_market BOOLEAN NOT NULL DEFAULT false,
	advanced_order_bundle BOOLEAN NOT NULL DEFAULT false,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tq_points_ledger (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
	change_type TEXT NOT NULL,
	source TEXT NOT NULL,
	delta INTEGER NOT NULL,
	balance_after INTEGER NOT NULL,
	reference_id TEXT,
	metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
	expires_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT tq_points_ledger_change_type_check CHECK (
		change_type IN ('earn', 'burn', 'expire', 'adjust')
	)
);

CREATE INDEX IF NOT EXISTS tq_points_ledger_user_time_idx ON public.tq_points_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tq_points_ledger_user_source_time_idx ON public.tq_points_ledger (user_id, source, created_at DESC);

CREATE TABLE IF NOT EXISTS public.t3_access_passes (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
	source TEXT NOT NULL,
	duration_days INTEGER NOT NULL CHECK (duration_days > 0),
	points_cost INTEGER CHECK (points_cost >= 0),
	start_at TIMESTAMPTZ NOT NULL,
	end_at TIMESTAMPTZ NOT NULL,
	status TEXT NOT NULL DEFAULT 'active',
	metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT t3_access_passes_source_check CHECK (source IN ('payment', 'points', 'manual')),
	CONSTRAINT t3_access_passes_status_check CHECK (status IN ('active', 'expired', 'cancelled')),
	CONSTRAINT t3_access_passes_time_check CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS t3_access_passes_user_time_idx ON public.t3_access_passes (user_id, end_at DESC);

CREATE OR REPLACE FUNCTION public.set_membership_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
	NEW.updated_at = NOW();
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_membership_accounts_updated_at ON public.membership_accounts;
CREATE TRIGGER trg_membership_accounts_updated_at
BEFORE UPDATE ON public.membership_accounts
FOR EACH ROW
EXECUTE FUNCTION public.set_membership_updated_at();

CREATE OR REPLACE FUNCTION public.sync_membership_entitlements(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_tier TEXT;
	v_trial_end TIMESTAMPTZ;
	v_period_end TIMESTAMPTZ;
	v_sim BOOLEAN := false;
	v_tq BOOLEAN := false;
	v_l2 BOOLEAN := false;
	v_adv BOOLEAN := false;
BEGIN
	SELECT tier, trial_end_at, current_period_end
	INTO v_tier, v_trial_end, v_period_end
	FROM public.membership_accounts
	WHERE user_id = p_user_id;

	IF NOT FOUND THEN
		RETURN;
	END IF;

	IF v_tier = 'T1' THEN
		v_sim := (v_trial_end >= NOW()) OR (v_period_end IS NOT NULL AND v_period_end >= NOW());
	ELSIF v_tier = 'T2' THEN
		v_sim := true;
		v_tq := true;
	ELSIF v_tier = 'T3' THEN
		v_sim := true;
		v_tq := true;
		v_l2 := true;
		v_adv := true;
	END IF;

	INSERT INTO public.membership_entitlements (
		user_id,
		sim_trading,
		tq_report,
		l2_market,
		advanced_order_bundle,
		updated_at
	)
	VALUES (p_user_id, v_sim, v_tq, v_l2, v_adv, NOW())
	ON CONFLICT (user_id) DO UPDATE
	SET
		sim_trading = EXCLUDED.sim_trading,
		tq_report = EXCLUDED.tq_report,
		l2_market = EXCLUDED.l2_market,
		advanced_order_bundle = EXCLUDED.advanced_order_bundle,
		updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_membership_entitlements()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
	PERFORM public.sync_membership_entitlements(NEW.user_id);
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_membership_entitlements_sync ON public.membership_accounts;
CREATE TRIGGER trg_membership_entitlements_sync
AFTER INSERT OR UPDATE OF tier, trial_end_at, current_period_end
ON public.membership_accounts
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_membership_entitlements();

CREATE OR REPLACE FUNCTION public.initialize_membership_for_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
	INSERT INTO public.membership_accounts (
		user_id,
		tier,
		status,
		trial_start_at,
		trial_end_at
	)
	VALUES (
		NEW.id,
		'T1',
		'trialing',
		NOW(),
		NOW() + INTERVAL '7 day'
	)
	ON CONFLICT (user_id) DO NOTHING;

	PERFORM public.sync_membership_entitlements(NEW.id);
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_membership ON auth.users;
CREATE TRIGGER on_auth_user_created_membership
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.initialize_membership_for_new_user();

-- 存量用户补齐
INSERT INTO public.membership_accounts (
	user_id,
	tier,
	status,
	trial_start_at,
	trial_end_at
)
SELECT
	u.id,
	'T1',
	'expired',
	COALESCE(u.created_at, NOW()),
	COALESCE(u.created_at, NOW()) + INTERVAL '7 day'
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.membership_entitlements (
	user_id,
	sim_trading,
	tq_report,
	l2_market,
	advanced_order_bundle,
	updated_at
)
SELECT
	ma.user_id,
	false,
	false,
	false,
	false,
	NOW()
FROM public.membership_accounts ma
ON CONFLICT (user_id) DO NOTHING;

UPDATE public.membership_accounts ma
SET status = CASE
	WHEN ma.tier = 'T1' AND ma.trial_end_at >= NOW() THEN 'trialing'
	WHEN ma.tier = 'T1' THEN 'expired'
	ELSE 'active'
END;

DO $$
DECLARE
	r RECORD;
BEGIN
	FOR r IN SELECT user_id FROM public.membership_accounts LOOP
		PERFORM public.sync_membership_entitlements(r.user_id);
	END LOOP;
END;
$$;

ALTER TABLE public.membership_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tq_points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t3_access_passes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS membership_accounts_own_select ON public.membership_accounts;
CREATE POLICY membership_accounts_own_select ON public.membership_accounts
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS membership_entitlements_own_select ON public.membership_entitlements;
CREATE POLICY membership_entitlements_own_select ON public.membership_entitlements
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS tq_points_ledger_own_select ON public.tq_points_ledger;
CREATE POLICY tq_points_ledger_own_select ON public.tq_points_ledger
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS t3_access_passes_own_select ON public.t3_access_passes;
CREATE POLICY t3_access_passes_own_select ON public.t3_access_passes
FOR SELECT TO authenticated
USING (user_id = auth.uid());
