-- AI 研究实验室：诊断会话 + 运行配置（无 API Key）

CREATE TABLE IF NOT EXISTS public.lab_sessions (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
	session_type TEXT NOT NULL DEFAULT 'diagnose'
		CHECK (session_type IN ('diagnose')),
	input_summary TEXT NOT NULL DEFAULT '',
	output_json JSONB NOT NULL DEFAULT '{}'::jsonb,
	provider TEXT NOT NULL DEFAULT 'gemini'
		CHECK (provider IN ('gemini', 'glm')),
	model TEXT NOT NULL DEFAULT '',
	tokens INTEGER,
	cost_cents INTEGER,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lab_sessions_user_id_created_at_idx
	ON public.lab_sessions (user_id, created_at DESC);

COMMENT ON TABLE public.lab_sessions IS 'AI 研究实验室会话（去标的化教学报告；不含截图本体）';

CREATE TABLE IF NOT EXISTS public.lab_config (
	key TEXT PRIMARY KEY,
	value JSONB NOT NULL DEFAULT '{}'::jsonb,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_by UUID REFERENCES auth.users (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.lab_config IS '实验室非敏感运行配置（active model 等）；禁止存 API Key';

INSERT INTO public.lab_config (key, value)
VALUES (
	'active_model',
	'{"provider":"gemini","model_id":"gemini-2.0-flash"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- 一次性 SSO 授权码（主站签发，Dojo 兑换后删除）
CREATE TABLE IF NOT EXISTS public.lab_sso_codes (
	jti UUID PRIMARY KEY,
	user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
	expires_at TIMESTAMPTZ NOT NULL,
	consumed_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lab_sso_codes_expires_at_idx ON public.lab_sso_codes (expires_at);

ALTER TABLE public.lab_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_sso_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lab_sessions_own_select ON public.lab_sessions;
CREATE POLICY lab_sessions_own_select ON public.lab_sessions
	FOR SELECT TO authenticated
	USING (user_id = auth.uid());

DROP POLICY IF EXISTS lab_sessions_own_insert ON public.lab_sessions;
CREATE POLICY lab_sessions_own_insert ON public.lab_sessions
	FOR INSERT TO authenticated
	WITH CHECK (user_id = auth.uid());

-- lab_config / lab_sso_codes：仅 service role（绕过 RLS）读写；authenticated 无策略即拒绝
DROP POLICY IF EXISTS lab_config_no_direct ON public.lab_config;
-- intentionally no authenticated policies on lab_config

DROP POLICY IF EXISTS lab_sso_codes_no_direct ON public.lab_sso_codes;
-- intentionally no authenticated policies on lab_sso_codes
