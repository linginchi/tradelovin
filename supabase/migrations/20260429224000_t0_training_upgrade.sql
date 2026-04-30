-- A股T+0训练系统升级：订单事件、挑战记录、标的类型

ALTER TABLE public.sim_orders
	ADD COLUMN IF NOT EXISTS instrument_type TEXT NOT NULL DEFAULT 'stock';

ALTER TABLE public.sim_orders
	DROP CONSTRAINT IF EXISTS sim_orders_instrument_type_check;

ALTER TABLE public.sim_orders
	ADD CONSTRAINT sim_orders_instrument_type_check CHECK (
		instrument_type IN ('stock', 'etf', 'cbond')
	);

CREATE TABLE IF NOT EXISTS public.sim_order_events (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	order_id UUID NOT NULL REFERENCES public.sim_orders (id) ON DELETE CASCADE,
	event_type TEXT NOT NULL,
	payload JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sim_order_events_order_id_idx ON public.sim_order_events (order_id);
CREATE INDEX IF NOT EXISTS sim_order_events_created_at_idx ON public.sim_order_events (created_at DESC);

CREATE TABLE IF NOT EXISTS public.sim_challenge_runs (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
	challenge_code TEXT NOT NULL,
	challenge_name TEXT NOT NULL,
	score NUMERIC(8, 2) NOT NULL DEFAULT 0,
	pnl_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
	max_drawdown_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
	talent_score NUMERIC(8, 2) NOT NULL DEFAULT 0,
	metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sim_challenge_runs_user_id_idx ON public.sim_challenge_runs (user_id);
CREATE INDEX IF NOT EXISTS sim_challenge_runs_created_at_idx ON public.sim_challenge_runs (created_at DESC);

ALTER TABLE public.sim_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sim_challenge_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sim_order_events_via_order ON public.sim_order_events;
CREATE POLICY sim_order_events_via_order ON public.sim_order_events FOR ALL TO authenticated USING (
	EXISTS (
		SELECT 1
		FROM public.sim_orders o
		JOIN public.sim_accounts a ON a.id = o.account_id
		WHERE o.id = sim_order_events.order_id
			AND a.user_id = auth.uid()
	)
)
WITH CHECK (
	EXISTS (
		SELECT 1
		FROM public.sim_orders o
		JOIN public.sim_accounts a ON a.id = o.account_id
		WHERE o.id = sim_order_events.order_id
			AND a.user_id = auth.uid()
	)
);

DROP POLICY IF EXISTS sim_challenge_runs_own_all ON public.sim_challenge_runs;
CREATE POLICY sim_challenge_runs_own_all ON public.sim_challenge_runs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
