-- Staff-generated one-time Stripe tuition links. Service role only; no membership grant.

CREATE TABLE IF NOT EXISTS public.staff_pay_links (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	token TEXT NOT NULL UNIQUE,
	amount_cents INTEGER NOT NULL CHECK (amount_cents >= 100 AND amount_cents <= 20000000),
	currency TEXT NOT NULL DEFAULT 'hkd',
	payer_name TEXT NOT NULL,
	note TEXT NOT NULL DEFAULT '',
	stripe_checkout_session_id TEXT NOT NULL UNIQUE,
	checkout_url TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'expired')),
	created_by TEXT NOT NULL,
	expires_at TIMESTAMPTZ NOT NULL,
	paid_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staff_pay_links_status_created_idx
	ON public.staff_pay_links(status, created_at DESC);

ALTER TABLE public.staff_pay_links ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.staff_pay_links TO service_role;
