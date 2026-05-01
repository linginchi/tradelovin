-- TQ 个性化证书（PDF + 图片）

CREATE TABLE IF NOT EXISTS public.tq_certificates (
	id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
	environment TEXT NOT NULL DEFAULT 'sim',
	period TEXT NOT NULL DEFAULT 'all',
	membership_tier TEXT NOT NULL,
	template_version TEXT NOT NULL DEFAULT 'v1',
	report_snapshot JSONB NOT NULL,
	pdf_path TEXT NOT NULL,
	image_path TEXT NOT NULL,
	issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT tq_certificates_env_check CHECK (environment IN ('sim', 'live')),
	CONSTRAINT tq_certificates_period_check CHECK (period IN ('daily', 'weekly', 'monthly', 'all')),
	CONSTRAINT tq_certificates_tier_check CHECK (membership_tier IN ('T1', 'T2', 'T3'))
);

CREATE INDEX IF NOT EXISTS tq_certificates_user_time_idx
ON public.tq_certificates (user_id, issued_at DESC);

ALTER TABLE public.tq_certificates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tq_certificates_own_select ON public.tq_certificates;
CREATE POLICY tq_certificates_own_select ON public.tq_certificates
FOR SELECT TO authenticated
USING (user_id = auth.uid());

