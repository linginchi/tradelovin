-- T+0 V2 做空基础模型（P3）
-- 目标：支持借券卖空与买券回补的台账记录。

ALTER TABLE public.tq_orders
ADD COLUMN IF NOT EXISTS position_mode TEXT NOT NULL DEFAULT 'long'
CHECK (position_mode IN ('long', 'short'));

CREATE TABLE IF NOT EXISTS public.tq_short_loans (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	account_id UUID NOT NULL REFERENCES public.tq_product_accounts(id) ON DELETE CASCADE,
	symbol TEXT NOT NULL,
	borrowed_qty INTEGER NOT NULL CHECK (borrowed_qty > 0),
	remaining_qty INTEGER NOT NULL CHECK (remaining_qty >= 0),
	avg_borrow_price NUMERIC(10, 4) NOT NULL,
	status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
	opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	closed_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tq_short_loans_user_symbol_idx ON public.tq_short_loans(user_id, symbol, status);
CREATE INDEX IF NOT EXISTS tq_short_loans_account_idx ON public.tq_short_loans(account_id, symbol, status);

DROP TRIGGER IF EXISTS trg_tq_v2_short_loans_updated_at ON public.tq_short_loans;
CREATE TRIGGER trg_tq_v2_short_loans_updated_at
BEFORE UPDATE ON public.tq_short_loans
FOR EACH ROW
EXECUTE FUNCTION public.tq_v2_set_updated_at();

ALTER TABLE public.tq_short_loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tq_short_loans_via_account ON public.tq_short_loans;
CREATE POLICY tq_short_loans_via_account ON public.tq_short_loans
FOR ALL TO authenticated
USING (
	EXISTS (
		SELECT 1
		FROM public.tq_product_accounts a
		WHERE a.id = tq_short_loans.account_id
			AND a.user_id = auth.uid()
	)
)
WITH CHECK (
	EXISTS (
		SELECT 1
		FROM public.tq_product_accounts a
		WHERE a.id = tq_short_loans.account_id
			AND a.user_id = auth.uid()
	)
);
