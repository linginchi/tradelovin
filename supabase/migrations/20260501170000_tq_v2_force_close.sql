-- T+0 V2 强平审计（P5）

CREATE TABLE IF NOT EXISTS public.tq_force_close_jobs (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	trigger_source TEXT NOT NULL CHECK (trigger_source IN ('manual', 'cron')),
	triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
	scope TEXT NOT NULL CHECK (scope IN ('self', 'all')),
	status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
	summary JSONB NOT NULL DEFAULT '{}'::jsonb,
	error_message TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.tq_force_close_events (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	job_id UUID NOT NULL REFERENCES public.tq_force_close_jobs(id) ON DELETE CASCADE,
	account_id UUID NOT NULL REFERENCES public.tq_product_accounts(id) ON DELETE CASCADE,
	symbol TEXT NOT NULL,
	position_type TEXT NOT NULL CHECK (position_type IN ('long', 'short')),
	quantity INTEGER NOT NULL CHECK (quantity > 0),
	price NUMERIC(10, 4),
	status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
	message TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tq_force_close_jobs_created_idx ON public.tq_force_close_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS tq_force_close_events_job_idx ON public.tq_force_close_events(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tq_force_close_events_account_idx ON public.tq_force_close_events(account_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_tq_v2_force_close_jobs_updated_at ON public.tq_force_close_jobs;
CREATE TRIGGER trg_tq_v2_force_close_jobs_updated_at
BEFORE UPDATE ON public.tq_force_close_jobs
FOR EACH ROW
EXECUTE FUNCTION public.tq_v2_set_updated_at();

ALTER TABLE public.tq_force_close_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tq_force_close_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tq_force_close_jobs_self_read ON public.tq_force_close_jobs;
CREATE POLICY tq_force_close_jobs_self_read ON public.tq_force_close_jobs
FOR SELECT TO authenticated
USING (triggered_by = auth.uid());

DROP POLICY IF EXISTS tq_force_close_events_via_account_read ON public.tq_force_close_events;
CREATE POLICY tq_force_close_events_via_account_read ON public.tq_force_close_events
FOR SELECT TO authenticated
USING (
	EXISTS (
		SELECT 1
		FROM public.tq_product_accounts a
		WHERE a.id = tq_force_close_events.account_id
			AND a.user_id = auth.uid()
	)
);
