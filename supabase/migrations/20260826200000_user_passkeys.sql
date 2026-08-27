-- Passkey credentials + one-shot challenges. Mutations go through service_role.

CREATE TABLE IF NOT EXISTS public.user_passkey_credentials (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	rp_id TEXT NOT NULL,
	credential_id TEXT NOT NULL UNIQUE,
	public_key BYTEA NOT NULL,
	sign_count BIGINT NOT NULL DEFAULT 0,
	transports TEXT[],
	device_label TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	last_used_at TIMESTAMPTZ,
	CONSTRAINT user_passkey_one_per_rp UNIQUE (user_id, rp_id),
	CONSTRAINT user_passkey_device_label_len CHECK (device_label IS NULL OR char_length(device_label) <= 80)
);

CREATE TABLE IF NOT EXISTS public.passkey_challenges (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
	purpose TEXT NOT NULL CHECK (purpose IN ('register', 'login')),
	rp_id TEXT NOT NULL,
	challenge TEXT NOT NULL,
	expires_at TIMESTAMPTZ NOT NULL,
	consumed_at TIMESTAMPTZ
);

ALTER TABLE public.user_passkey_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_passkey_own_select ON public.user_passkey_credentials
FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT ON public.user_passkey_credentials TO authenticated;
GRANT ALL ON public.user_passkey_credentials TO service_role;
GRANT ALL ON public.passkey_challenges TO service_role;

-- No authenticated policies: only service_role (bypasses RLS) may read/write challenges.
ALTER TABLE public.passkey_challenges ENABLE ROW LEVEL SECURITY;
