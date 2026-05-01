-- TQ 引擎运维增强：索引与查询加速

CREATE INDEX IF NOT EXISTS tq_features_lookup_idx
ON public.tq_features (user_id, environment, period, feature_name, calc_time DESC);

CREATE INDEX IF NOT EXISTS tq_scores_lookup_idx
ON public.tq_scores (user_id, environment, period, dimension, calc_time DESC);

CREATE INDEX IF NOT EXISTS tq_scores_env_period_idx
ON public.tq_scores (environment, period, calc_time DESC);

CREATE INDEX IF NOT EXISTS tq_cron_runs_status_time_idx
ON public.tq_cron_runs (status, triggered_at DESC);

