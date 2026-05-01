-- TQ cron v2: 支持环境与周期参数化

CREATE OR REPLACE FUNCTION public.calculate_tq_all_users()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
	endpoint TEXT;
	api_key TEXT;
	environments JSONB;
	periods JSONB;
	resp_id BIGINT;
BEGIN
	SELECT value->>'endpoint' INTO endpoint
	FROM public.tq_config
	WHERE key = 'cron_http';

	SELECT value->>'api_key' INTO api_key
	FROM public.tq_config
	WHERE key = 'cron_http';

	SELECT coalesce(value->'environments', '["sim","live"]'::jsonb) INTO environments
	FROM public.tq_config
	WHERE key = 'cron_http';

	SELECT coalesce(value->'periods', '["all"]'::jsonb) INTO periods
	FROM public.tq_config
	WHERE key = 'cron_http';

	IF endpoint IS NULL OR api_key IS NULL THEN
		RAISE EXCEPTION 'tq_config.cron_http endpoint/api_key 未配置';
	END IF;

	INSERT INTO public.tq_cron_runs (status, response)
	VALUES (
		'queued',
		jsonb_build_object(
			'endpoint', endpoint,
			'environments', environments,
			'periods', periods
		)
	)
	RETURNING id INTO resp_id;

	PERFORM net.http_post(
		url := endpoint,
		headers := jsonb_build_object(
			'content-type', 'application/json',
			'x-tq-cron-key', api_key
		),
		body := jsonb_build_object(
			'source', 'pg_cron',
			'env', array_to_string(ARRAY(SELECT jsonb_array_elements_text(environments)), ','),
			'period', array_to_string(ARRAY(SELECT jsonb_array_elements_text(periods)), ',')
		)
	);

	UPDATE public.tq_cron_runs
	SET status = 'triggered',
		response = coalesce(response, '{}'::jsonb) || jsonb_build_object('triggered', NOW())
	WHERE id = resp_id;
END;
$$;

UPDATE public.tq_config
SET value = coalesce(value, '{}'::jsonb)
	|| jsonb_build_object(
		'environments', coalesce(value->'environments', '["sim","live"]'::jsonb),
		'periods', coalesce(value->'periods', '["all"]'::jsonb)
	)
WHERE key = 'cron_http';

