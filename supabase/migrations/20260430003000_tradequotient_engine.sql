-- TradeQuotient (TQ) 引擎：基础表结构 + sim_trades 扩展

ALTER TABLE public.sim_trades
	ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'sim',
	ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'sim_trading',
	ADD COLUMN IF NOT EXISTS user_id UUID;

UPDATE public.sim_trades st
SET user_id = sa.user_id
FROM public.sim_accounts sa
WHERE st.account_id = sa.id
	AND st.user_id IS NULL;

CREATE INDEX IF NOT EXISTS sim_trades_user_env_time_idx ON public.sim_trades (
	user_id,
	environment,
	trade_time DESC
);

CREATE TABLE IF NOT EXISTS public.tq_features (
	id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
	period TEXT NOT NULL,
	environment TEXT NOT NULL DEFAULT 'sim',
	feature_name TEXT NOT NULL,
	raw_value NUMERIC(20, 8) NOT NULL DEFAULT 0,
	norm_score NUMERIC(10, 4) NOT NULL DEFAULT 0,
	calc_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT tq_features_period_check CHECK (period IN ('daily', 'weekly', 'monthly', 'all')),
	CONSTRAINT tq_features_env_check CHECK (environment IN ('sim', 'live')),
	CONSTRAINT tq_features_norm_score_check CHECK (norm_score >= 0 AND norm_score <= 100),
	UNIQUE (user_id, period, environment, feature_name)
);

CREATE TABLE IF NOT EXISTS public.tq_scores (
	id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
	period TEXT NOT NULL,
	environment TEXT NOT NULL DEFAULT 'sim',
	dimension TEXT NOT NULL,
	score NUMERIC(10, 4) NOT NULL DEFAULT 0,
	total_score NUMERIC(10, 4) NOT NULL DEFAULT 0,
	calc_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT tq_scores_period_check CHECK (period IN ('daily', 'weekly', 'monthly', 'all')),
	CONSTRAINT tq_scores_env_check CHECK (environment IN ('sim', 'live')),
	CONSTRAINT tq_scores_dimension_check CHECK (
		dimension IN ('profitability', 'risk_control', 'consistency', 'activeness')
	),
	CONSTRAINT tq_scores_score_check CHECK (score >= 0 AND score <= 100),
	CONSTRAINT tq_scores_total_score_check CHECK (total_score >= 0 AND total_score <= 100),
	UNIQUE (user_id, period, environment, dimension)
);

CREATE TABLE IF NOT EXISTS public.tq_baseline_users (
	user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
	added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tq_config (
	key TEXT PRIMARY KEY,
	value JSONB NOT NULL,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.tq_config (key, value)
VALUES
	(
		'feature_weights',
		'{
      "profitability":{"AllTimePnl":0.2,"AvgDailyPnl":0.15,"WinRatio":0.2,"WinningDayRatio":0.15,"Streak":0.1,"PnlEfficiency":0.1,"EffSharpeRatio":0.1,"MinNegPnl":0,"MaxDrawDown":0,"PotentialRisk":0,"RiskOverPnl":0,"EffVar":0,"StdNegEff":0,"StdQuantity":0,"SortinoRatio":0,"DivConsistency":0,"TradeDays":0,"TradeCount":0,"ActiveRatio":0},
      "risk_control":{"AllTimePnl":0,"AvgDailyPnl":0,"WinRatio":0,"WinningDayRatio":0,"Streak":0,"PnlEfficiency":0,"EffSharpeRatio":0,"MinNegPnl":0.25,"MaxDrawDown":0.25,"PotentialRisk":0.2,"RiskOverPnl":0.15,"EffVar":0.15,"StdNegEff":0,"StdQuantity":0,"SortinoRatio":0,"DivConsistency":0,"TradeDays":0,"TradeCount":0,"ActiveRatio":0},
      "consistency":{"AllTimePnl":0,"AvgDailyPnl":0,"WinRatio":0,"WinningDayRatio":0,"Streak":0,"PnlEfficiency":0,"EffSharpeRatio":0,"MinNegPnl":0,"MaxDrawDown":0,"PotentialRisk":0,"RiskOverPnl":0,"EffVar":0,"StdNegEff":0.35,"StdQuantity":0.35,"SortinoRatio":0.3,"DivConsistency":0,"TradeDays":0,"TradeCount":0,"ActiveRatio":0},
      "activeness":{"AllTimePnl":0,"AvgDailyPnl":0,"WinRatio":0,"WinningDayRatio":0,"Streak":0,"PnlEfficiency":0,"EffSharpeRatio":0,"MinNegPnl":0,"MaxDrawDown":0,"PotentialRisk":0,"RiskOverPnl":0,"EffVar":0,"StdNegEff":0,"StdQuantity":0,"SortinoRatio":0,"DivConsistency":0,"TradeDays":0.4,"TradeCount":0.35,"ActiveRatio":0.25}
    }'::jsonb
	),
	(
		'dimension_weights',
		'{"profitability":0.5,"risk_control":0.35,"consistency":0.1,"activeness":0.05}'::jsonb
	)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.tq_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tq_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tq_baseline_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tq_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tq_features_own_select ON public.tq_features;
CREATE POLICY tq_features_own_select ON public.tq_features
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS tq_scores_own_select ON public.tq_scores;
CREATE POLICY tq_scores_own_select ON public.tq_scores
FOR SELECT TO authenticated
USING (user_id = auth.uid());
