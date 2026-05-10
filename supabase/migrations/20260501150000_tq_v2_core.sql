-- T+0 V2 核心模型（P0）
-- 目标：为 /trade-v2 提供多产品多账户、资源额度、交易与监控条件单基础数据结构。

-- -----------------------------------------------------------------------------
-- 通用 updated_at 触发器函数
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tq_v2_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
	NEW.updated_at = NOW();
	RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 产品与账户
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tq_products (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	name TEXT NOT NULL,
	code TEXT NOT NULL UNIQUE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.tq_products IS '交易产品定义，如 A股/港股/期货等（模拟）';

CREATE TABLE IF NOT EXISTS public.tq_product_accounts (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	product_id UUID NOT NULL REFERENCES public.tq_products(id) ON DELETE RESTRICT,
	account_type TEXT NOT NULL CHECK (account_type IN ('normal', 'credit')),
	account_name TEXT NOT NULL DEFAULT '默认账户',
	available_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
	frozen_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
	credit_limit NUMERIC(12, 2) NOT NULL DEFAULT 0,
	status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'closed')),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tq_product_accounts_user_idx ON public.tq_product_accounts(user_id);
CREATE INDEX IF NOT EXISTS tq_product_accounts_user_product_idx ON public.tq_product_accounts(user_id, product_id);

COMMENT ON TABLE public.tq_product_accounts IS '用户产品账户（可普通/信用子账户）';

-- -----------------------------------------------------------------------------
-- 资源额度
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tq_public_resources (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	symbol TEXT NOT NULL,
	name TEXT,
	long_limit INTEGER NOT NULL DEFAULT 0 CHECK (long_limit >= 0),
	short_limit INTEGER NOT NULL DEFAULT 0 CHECK (short_limit >= 0),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE(symbol)
);

COMMENT ON TABLE public.tq_public_resources IS '公共资源池：每个标的可做多/做空总额度';

CREATE TABLE IF NOT EXISTS public.tq_user_resources (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	symbol TEXT NOT NULL,
	long_quota INTEGER NOT NULL DEFAULT 0 CHECK (long_quota >= 0),
	short_quota INTEGER NOT NULL DEFAULT 0 CHECK (short_quota >= 0),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE(user_id, symbol)
);

CREATE INDEX IF NOT EXISTS tq_user_resources_user_idx ON public.tq_user_resources(user_id);

COMMENT ON TABLE public.tq_user_resources IS '用户个人额度（获批后可用）';

CREATE TABLE IF NOT EXISTS public.tq_dynamic_resources (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	symbol TEXT NOT NULL,
	quantity INTEGER NOT NULL CHECK (quantity > 0),
	expires_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tq_dynamic_resources_user_symbol_idx ON public.tq_dynamic_resources(user_id, symbol);

COMMENT ON TABLE public.tq_dynamic_resources IS '风控临时资源分配（可选）';

-- -----------------------------------------------------------------------------
-- 交易主表：委托、成交、持仓
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tq_orders (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	account_id UUID NOT NULL REFERENCES public.tq_product_accounts(id) ON DELETE CASCADE,
	symbol TEXT NOT NULL,
	side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
	order_type TEXT NOT NULL DEFAULT 'limit' CHECK (order_type IN ('limit', 'market')),
	price NUMERIC(10, 4),
	quantity INTEGER NOT NULL CHECK (quantity > 0),
	filled_qty INTEGER NOT NULL DEFAULT 0 CHECK (filled_qty >= 0 AND filled_qty <= quantity),
	status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'filled', 'cancelled', 'rejected')),
	reject_reason TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tq_orders_account_created_idx ON public.tq_orders(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tq_orders_account_status_idx ON public.tq_orders(account_id, status, created_at DESC);

COMMENT ON TABLE public.tq_orders IS 'V2 委托表';

CREATE TABLE IF NOT EXISTS public.tq_trades (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	order_id UUID REFERENCES public.tq_orders(id) ON DELETE SET NULL,
	account_id UUID NOT NULL REFERENCES public.tq_product_accounts(id) ON DELETE CASCADE,
	symbol TEXT NOT NULL,
	side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
	price NUMERIC(10, 4) NOT NULL,
	quantity INTEGER NOT NULL CHECK (quantity > 0),
	trade_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tq_trades_account_time_idx ON public.tq_trades(account_id, trade_time DESC);
CREATE INDEX IF NOT EXISTS tq_trades_order_idx ON public.tq_trades(order_id);

COMMENT ON TABLE public.tq_trades IS 'V2 成交表';

CREATE TABLE IF NOT EXISTS public.tq_positions (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	account_id UUID NOT NULL REFERENCES public.tq_product_accounts(id) ON DELETE CASCADE,
	symbol TEXT NOT NULL,
	position_type TEXT NOT NULL CHECK (position_type IN ('long', 'short')),
	quantity INTEGER NOT NULL CHECK (quantity >= 0),
	available_qty INTEGER NOT NULL CHECK (available_qty >= 0),
	cost_price NUMERIC(10, 4) NOT NULL DEFAULT 0,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE(account_id, symbol, position_type)
);

CREATE INDEX IF NOT EXISTS tq_positions_account_idx ON public.tq_positions(account_id);

COMMENT ON TABLE public.tq_positions IS 'V2 实时持仓（多空分离）';

-- -----------------------------------------------------------------------------
-- 监控与条件单
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tq_watchlist (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	symbol TEXT NOT NULL,
	alert_price NUMERIC(10, 4),
	alert_type TEXT NOT NULL CHECK (alert_type IN ('price_above', 'price_below', 'percent_up', 'percent_down')),
	triggered BOOLEAN NOT NULL DEFAULT false,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tq_watchlist_user_idx ON public.tq_watchlist(user_id, created_at DESC);

COMMENT ON TABLE public.tq_watchlist IS '监控预警';

CREATE TABLE IF NOT EXISTS public.tq_conditional_orders (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	symbol TEXT NOT NULL,
	condition_type TEXT NOT NULL CHECK (condition_type IN ('price_>=', 'price_<=')),
	condition_price NUMERIC(10, 4) NOT NULL,
	order_side TEXT NOT NULL CHECK (order_side IN ('buy', 'sell')),
	order_price NUMERIC(10, 4),
	order_quantity INTEGER NOT NULL CHECK (order_quantity > 0),
	status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'triggered', 'expired', 'cancelled')),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tq_conditional_orders_user_status_idx ON public.tq_conditional_orders(user_id, status, created_at DESC);

COMMENT ON TABLE public.tq_conditional_orders IS '条件单';

-- -----------------------------------------------------------------------------
-- 默认产品种子数据
-- -----------------------------------------------------------------------------
INSERT INTO public.tq_products(name, code)
VALUES ('A股', 'STOCK_CN')
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- updated_at 触发器
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_tq_v2_products_updated_at ON public.tq_products;
CREATE TRIGGER trg_tq_v2_products_updated_at
BEFORE UPDATE ON public.tq_products
FOR EACH ROW
EXECUTE FUNCTION public.tq_v2_set_updated_at();

DROP TRIGGER IF EXISTS trg_tq_v2_product_accounts_updated_at ON public.tq_product_accounts;
CREATE TRIGGER trg_tq_v2_product_accounts_updated_at
BEFORE UPDATE ON public.tq_product_accounts
FOR EACH ROW
EXECUTE FUNCTION public.tq_v2_set_updated_at();

DROP TRIGGER IF EXISTS trg_tq_v2_public_resources_updated_at ON public.tq_public_resources;
CREATE TRIGGER trg_tq_v2_public_resources_updated_at
BEFORE UPDATE ON public.tq_public_resources
FOR EACH ROW
EXECUTE FUNCTION public.tq_v2_set_updated_at();

DROP TRIGGER IF EXISTS trg_tq_v2_user_resources_updated_at ON public.tq_user_resources;
CREATE TRIGGER trg_tq_v2_user_resources_updated_at
BEFORE UPDATE ON public.tq_user_resources
FOR EACH ROW
EXECUTE FUNCTION public.tq_v2_set_updated_at();

DROP TRIGGER IF EXISTS trg_tq_v2_orders_updated_at ON public.tq_orders;
CREATE TRIGGER trg_tq_v2_orders_updated_at
BEFORE UPDATE ON public.tq_orders
FOR EACH ROW
EXECUTE FUNCTION public.tq_v2_set_updated_at();

DROP TRIGGER IF EXISTS trg_tq_v2_positions_updated_at ON public.tq_positions;
CREATE TRIGGER trg_tq_v2_positions_updated_at
BEFORE UPDATE ON public.tq_positions
FOR EACH ROW
EXECUTE FUNCTION public.tq_v2_set_updated_at();

DROP TRIGGER IF EXISTS trg_tq_v2_watchlist_updated_at ON public.tq_watchlist;
CREATE TRIGGER trg_tq_v2_watchlist_updated_at
BEFORE UPDATE ON public.tq_watchlist
FOR EACH ROW
EXECUTE FUNCTION public.tq_v2_set_updated_at();

DROP TRIGGER IF EXISTS trg_tq_v2_conditional_orders_updated_at ON public.tq_conditional_orders;
CREATE TRIGGER trg_tq_v2_conditional_orders_updated_at
BEFORE UPDATE ON public.tq_conditional_orders
FOR EACH ROW
EXECUTE FUNCTION public.tq_v2_set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.tq_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tq_product_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tq_public_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tq_user_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tq_dynamic_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tq_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tq_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tq_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tq_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tq_conditional_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tq_products_read_all ON public.tq_products;
CREATE POLICY tq_products_read_all ON public.tq_products
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS tq_public_resources_read_all ON public.tq_public_resources;
CREATE POLICY tq_public_resources_read_all ON public.tq_public_resources
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS tq_product_accounts_own_all ON public.tq_product_accounts;
CREATE POLICY tq_product_accounts_own_all ON public.tq_product_accounts
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS tq_user_resources_own_all ON public.tq_user_resources;
CREATE POLICY tq_user_resources_own_all ON public.tq_user_resources
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS tq_dynamic_resources_own_all ON public.tq_dynamic_resources;
CREATE POLICY tq_dynamic_resources_own_all ON public.tq_dynamic_resources
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS tq_orders_via_account ON public.tq_orders;
CREATE POLICY tq_orders_via_account ON public.tq_orders
FOR ALL TO authenticated
USING (
	EXISTS (
		SELECT 1
		FROM public.tq_product_accounts a
		WHERE a.id = tq_orders.account_id
			AND a.user_id = auth.uid()
	)
)
WITH CHECK (
	EXISTS (
		SELECT 1
		FROM public.tq_product_accounts a
		WHERE a.id = tq_orders.account_id
			AND a.user_id = auth.uid()
	)
);

DROP POLICY IF EXISTS tq_trades_via_account ON public.tq_trades;
CREATE POLICY tq_trades_via_account ON public.tq_trades
FOR ALL TO authenticated
USING (
	EXISTS (
		SELECT 1
		FROM public.tq_product_accounts a
		WHERE a.id = tq_trades.account_id
			AND a.user_id = auth.uid()
	)
)
WITH CHECK (
	EXISTS (
		SELECT 1
		FROM public.tq_product_accounts a
		WHERE a.id = tq_trades.account_id
			AND a.user_id = auth.uid()
	)
);

DROP POLICY IF EXISTS tq_positions_via_account ON public.tq_positions;
CREATE POLICY tq_positions_via_account ON public.tq_positions
FOR ALL TO authenticated
USING (
	EXISTS (
		SELECT 1
		FROM public.tq_product_accounts a
		WHERE a.id = tq_positions.account_id
			AND a.user_id = auth.uid()
	)
)
WITH CHECK (
	EXISTS (
		SELECT 1
		FROM public.tq_product_accounts a
		WHERE a.id = tq_positions.account_id
			AND a.user_id = auth.uid()
	)
);

DROP POLICY IF EXISTS tq_watchlist_own_all ON public.tq_watchlist;
CREATE POLICY tq_watchlist_own_all ON public.tq_watchlist
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS tq_conditional_orders_own_all ON public.tq_conditional_orders;
CREATE POLICY tq_conditional_orders_own_all ON public.tq_conditional_orders
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
