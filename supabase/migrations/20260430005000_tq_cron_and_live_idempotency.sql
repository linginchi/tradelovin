-- TQ: pg_cron 调度 + live 导入幂等/去重结构

CREATE TABLE IF NOT EXISTS public.tq_live_import_requests (
	id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	request_id TEXT NOT NULL UNIQUE,
	payload_hash TEXT NOT NULL,
	source TEXT NOT NULL DEFAULT 'live_api',
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tq_live_import_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sim_trades
	ADD COLUMN IF NOT EXISTS external_trade_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS sim_trades_source_external_trade_id_uq
ON public.sim_trades (source, external_trade_id)
WHERE external_trade_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.tq_cron_runs (
	id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	status TEXT NOT NULL DEFAULT 'queued',
	response JSONB
);

ALTER TABLE public.tq_cron_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
		CREATE EXTENSION pg_net;
	END IF;
EXCEPTION
	WHEN OTHERS THEN
		RAISE NOTICE 'pg_net extension unavailable: %', SQLERRM;
END $$;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
		CREATE EXTENSION pg_cron;
	END IF;
EXCEPTION
	WHEN OTHERS THEN
		RAISE NOTICE 'pg_cron extension unavailable: %', SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION public.calculate_tq_all_users()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
	endpoint TEXT;
	api_key TEXT;
	resp_id BIGINT;
BEGIN
	SELECT value->>'endpoint' INTO endpoint
	FROM public.tq_config
	WHERE key = 'cron_http';

	SELECT value->>'api_key' INTO api_key
	FROM public.tq_config
	WHERE key = 'cron_http';

	IF endpoint IS NULL OR api_key IS NULL THEN
		RAISE EXCEPTION 'tq_config.cron_http endpoint/api_key 未配置';
	END IF;

	INSERT INTO public.tq_cron_runs (status, response)
	VALUES ('queued', jsonb_build_object('endpoint', endpoint))
	RETURNING id INTO resp_id;

	PERFORM net.http_post(
		url := endpoint,
		headers := jsonb_build_object(
			'content-type', 'application/json',
			'x-tq-cron-key', api_key
		),
		body := jsonb_build_object('source', 'pg_cron')
	);

	UPDATE public.tq_cron_runs
	SET status = 'triggered',
		response = coalesce(response, '{}'::jsonb) || jsonb_build_object('triggered', NOW())
	WHERE id = resp_id;
END;
$$;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
		IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'calculate-tq') THEN
			PERFORM cron.unschedule((SELECT jobid FROM cron.job WHERE jobname = 'calculate-tq' LIMIT 1));
		END IF;
		PERFORM cron.schedule('calculate-tq', '0 2 * * *', 'SELECT public.calculate_tq_all_users();');
	END IF;
EXCEPTION
	WHEN OTHERS THEN
		RAISE NOTICE 'cron.schedule skipped: %', SQLERRM;
END $$;

INSERT INTO public.tq_config (key, value)
VALUES (
	'cron_http',
	jsonb_build_object(
		'endpoint', 'https://your-domain.com/api/tq/cron/recalculate',
		'api_key', 'replace_me'
	)
)
ON CONFLICT (key) DO NOTHING;
