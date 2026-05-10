-- T+0 V2 用户交易偏好（P8）

CREATE TABLE IF NOT EXISTS public.tq_user_trade_prefs (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
	default_qty INTEGER NOT NULL DEFAULT 100 CHECK (default_qty > 0),
	default_account_type TEXT NOT NULL DEFAULT 'normal' CHECK (default_account_type IN ('normal', 'credit')),
	default_position_mode TEXT NOT NULL DEFAULT 'long' CHECK (default_position_mode IN ('long', 'short')),
	default_source_mode TEXT NOT NULL DEFAULT 'normal' CHECK (default_source_mode IN ('normal', 'fast')),
	auto_logout_night BOOLEAN NOT NULL DEFAULT false,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tq_user_trade_prefs_user_idx ON public.tq_user_trade_prefs(user_id);

DROP TRIGGER IF EXISTS trg_tq_v2_user_trade_prefs_updated_at ON public.tq_user_trade_prefs;
CREATE TRIGGER trg_tq_v2_user_trade_prefs_updated_at
BEFORE UPDATE ON public.tq_user_trade_prefs
FOR EACH ROW
EXECUTE FUNCTION public.tq_v2_set_updated_at();

ALTER TABLE public.tq_user_trade_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tq_user_trade_prefs_own_all ON public.tq_user_trade_prefs;
CREATE POLICY tq_user_trade_prefs_own_all ON public.tq_user_trade_prefs
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
