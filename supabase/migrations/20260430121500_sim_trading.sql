-- 豹仔乐园：模拟交易（P0）— sim_accounts / sim_positions / sim_orders / sim_trades
-- sim_accounts.user_id 对齐 Supabase Auth：REFERENCES auth.users(id)；可由 supabase db push  applied。

-- -----------------------------------------------------------------------------
-- sim_accounts（模拟账户）
-- -----------------------------------------------------------------------------
CREATE TABLE public.sim_accounts (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
	account_name TEXT NOT NULL DEFAULT '主账户',
	initial_balance NUMERIC(12, 2) NOT NULL DEFAULT 100000.00,
	current_balance NUMERIC(12, 2) NOT NULL DEFAULT 100000.00,
	frozen_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
	status TEXT NOT NULL DEFAULT 'active',
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT sim_accounts_balance_nonneg CHECK (
		current_balance >= 0
		AND frozen_balance >= 0
		AND initial_balance >= 0
	),
	CONSTRAINT sim_accounts_status_check CHECK (
		status IN ('active', 'closed')
	)
);

CREATE INDEX sim_accounts_user_id_idx ON public.sim_accounts (user_id);

COMMENT ON TABLE public.sim_accounts IS '模拟交易账户';

-- -----------------------------------------------------------------------------
-- sim_positions（持仓）
-- -----------------------------------------------------------------------------
CREATE TABLE public.sim_positions (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	account_id UUID NOT NULL REFERENCES public.sim_accounts (id) ON DELETE CASCADE,
	symbol TEXT NOT NULL,
	name TEXT,
	quantity INTEGER NOT NULL DEFAULT 0,
	available_qty INTEGER NOT NULL DEFAULT 0,
	frozen_qty INTEGER NOT NULL DEFAULT 0,
	cost_price NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
	market_value NUMERIC(12, 2) DEFAULT 0.00,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE (account_id, symbol),
	CONSTRAINT sim_positions_qty_nonneg CHECK (
		quantity >= 0
		AND available_qty >= 0
		AND frozen_qty >= 0
	)
);

CREATE INDEX sim_positions_account_id_idx ON public.sim_positions (account_id);

COMMENT ON TABLE public.sim_positions IS '模拟持仓';

-- -----------------------------------------------------------------------------
-- sim_orders（委托）
-- -----------------------------------------------------------------------------
CREATE TABLE public.sim_orders (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	account_id UUID NOT NULL REFERENCES public.sim_accounts (id) ON DELETE CASCADE,
	symbol TEXT NOT NULL,
	side TEXT NOT NULL,
	price NUMERIC(10, 4) NOT NULL,
	quantity INTEGER NOT NULL CHECK (quantity > 0),
	filled_qty INTEGER NOT NULL DEFAULT 0 CHECK (filled_qty >= 0),
	status TEXT NOT NULL DEFAULT 'pending',
	order_type TEXT NOT NULL DEFAULT 'limit',
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT sim_orders_side_check CHECK (side IN ('buy', 'sell')),
	CONSTRAINT sim_orders_status_check CHECK (
		status IN (
			'pending',
			'partial',
			'filled',
			'cancelled',
			'rejected'
		)
	),
	CONSTRAINT sim_orders_order_type_check CHECK (
		order_type IN ('limit')
	),
	CONSTRAINT sim_orders_filled_vs_qty CHECK (
		filled_qty <= quantity
	)
);

CREATE INDEX sim_orders_account_id_idx ON public.sim_orders (account_id);
CREATE INDEX sim_orders_created_at_idx ON public.sim_orders (created_at DESC);
CREATE INDEX sim_orders_account_status_created_idx ON public.sim_orders (
	account_id,
	status,
	created_at DESC
);

COMMENT ON TABLE public.sim_orders IS '模拟委托（限价）；撮合仅需更新订单状态与成交表';

-- -----------------------------------------------------------------------------
-- sim_trades（成交明细）
-- -----------------------------------------------------------------------------
CREATE TABLE public.sim_trades (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	order_id UUID REFERENCES public.sim_orders (id) ON DELETE SET NULL,
	account_id UUID NOT NULL REFERENCES public.sim_accounts (id) ON DELETE CASCADE,
	symbol TEXT NOT NULL,
	side TEXT NOT NULL,
	price NUMERIC(10, 4) NOT NULL,
	quantity INTEGER NOT NULL CHECK (quantity > 0),
	commission NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
	stamp_tax NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
	trade_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT sim_trades_side_check CHECK (side IN ('buy', 'sell'))
);

CREATE INDEX sim_trades_account_id_idx ON public.sim_trades (account_id);
CREATE INDEX sim_trades_trade_time_idx ON public.sim_trades (trade_time DESC);
CREATE INDEX sim_trades_order_id_idx ON public.sim_trades (order_id);

COMMENT ON TABLE public.sim_trades IS '模拟成交明细；印花税存 stamp_tax（卖出），佣金 commission；过户费可先并入 commission 或后续加列迁移';

-- -----------------------------------------------------------------------------
-- Row Level Security（user_id = auth.users.id ↔ auth.uid()）
-- -----------------------------------------------------------------------------
ALTER TABLE public.sim_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sim_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sim_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sim_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY sim_accounts_own_all ON public.sim_accounts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY sim_positions_via_account ON public.sim_positions FOR ALL TO authenticated USING (
	EXISTS (
		SELECT 1
		FROM public.sim_accounts a
		WHERE a.id = sim_positions.account_id
			AND a.user_id = auth.uid()
	)
)
WITH CHECK (
	EXISTS (
		SELECT 1
		FROM public.sim_accounts a
		WHERE a.id = sim_positions.account_id
			AND a.user_id = auth.uid()
	)
);

CREATE POLICY sim_orders_via_account ON public.sim_orders FOR ALL TO authenticated USING (
	EXISTS (
		SELECT 1
		FROM public.sim_accounts a
		WHERE a.id = sim_orders.account_id
			AND a.user_id = auth.uid()
	)
)
WITH CHECK (
	EXISTS (
		SELECT 1
		FROM public.sim_accounts a
		WHERE a.id = sim_orders.account_id
			AND a.user_id = auth.uid()
	)
);

CREATE POLICY sim_trades_via_account ON public.sim_trades FOR ALL TO authenticated USING (
	EXISTS (
		SELECT 1
		FROM public.sim_accounts a
		WHERE a.id = sim_trades.account_id
			AND a.user_id = auth.uid()
	)
)
WITH CHECK (
	EXISTS (
		SELECT 1
		FROM public.sim_accounts a
		WHERE a.id = sim_trades.account_id
			AND a.user_id = auth.uid()
	)
);
