export const TQ_PERIODS = ["all", "monthly", "weekly", "daily"] as const;
export const TQ_ENVIRONMENTS = ["sim", "live"] as const;
export const TQ_DIMENSIONS = ["profitability", "risk_control", "consistency", "activeness"] as const;

export type TqPeriod = (typeof TQ_PERIODS)[number];
export type TqEnvironment = (typeof TQ_ENVIRONMENTS)[number];
export type TqDimension = (typeof TQ_DIMENSIONS)[number];

export type TqFeatureName =
	| "AllTimePnl"
	| "AvgDailyPnl"
	| "WinRatio"
	| "WinningDayRatio"
	| "Streak"
	| "PnlEfficiency"
	| "EffSharpeRatio"
	| "MinNegPnl"
	| "MaxDrawDown"
	| "PotentialRisk"
	| "RiskOverPnl"
	| "EffVar"
	| "StdNegEff"
	| "StdQuantity"
	| "SortinoRatio"
	| "DivConsistency"
	| "TradeDays"
	| "TradeCount"
	| "ActiveRatio";

export const TQ_PERIOD_WINDOW_DAYS: Record<TqPeriod, number | null> = {
	all: null,
	monthly: 30,
	weekly: 7,
	daily: 1,
};

export const TQ_MIN_TRADES_FOR_SCORE: Record<TqEnvironment, number> = {
	sim: 10,
	live: 20,
};

export const TQ_FEATURES: TqFeatureName[] = [
	"AllTimePnl",
	"AvgDailyPnl",
	"WinRatio",
	"WinningDayRatio",
	"Streak",
	"PnlEfficiency",
	"EffSharpeRatio",
	"MinNegPnl",
	"MaxDrawDown",
	"PotentialRisk",
	"RiskOverPnl",
	"EffVar",
	"StdNegEff",
	"StdQuantity",
	"SortinoRatio",
	"DivConsistency",
	"TradeDays",
	"TradeCount",
	"ActiveRatio",
];

export const FEATURE_DIRECTION: Record<TqFeatureName, "higher_better" | "lower_better"> = {
	AllTimePnl: "higher_better",
	AvgDailyPnl: "higher_better",
	WinRatio: "higher_better",
	WinningDayRatio: "higher_better",
	Streak: "higher_better",
	PnlEfficiency: "higher_better",
	EffSharpeRatio: "higher_better",
	MinNegPnl: "lower_better",
	MaxDrawDown: "lower_better",
	PotentialRisk: "lower_better",
	RiskOverPnl: "lower_better",
	EffVar: "lower_better",
	StdNegEff: "lower_better",
	StdQuantity: "lower_better",
	SortinoRatio: "higher_better",
	DivConsistency: "lower_better",
	TradeDays: "higher_better",
	TradeCount: "higher_better",
	ActiveRatio: "higher_better",
};

export const DEFAULT_FEATURE_WEIGHTS: Record<TqDimension, Record<TqFeatureName, number>> = {
	profitability: {
		AllTimePnl: 0.2,
		AvgDailyPnl: 0.15,
		WinRatio: 0.2,
		WinningDayRatio: 0.15,
		Streak: 0.1,
		PnlEfficiency: 0.1,
		EffSharpeRatio: 0.1,
		MinNegPnl: 0,
		MaxDrawDown: 0,
		PotentialRisk: 0,
		RiskOverPnl: 0,
		EffVar: 0,
		StdNegEff: 0,
		StdQuantity: 0,
		SortinoRatio: 0,
		DivConsistency: 0,
		TradeDays: 0,
		TradeCount: 0,
		ActiveRatio: 0,
	},
	risk_control: {
		AllTimePnl: 0,
		AvgDailyPnl: 0,
		WinRatio: 0,
		WinningDayRatio: 0,
		Streak: 0,
		PnlEfficiency: 0,
		EffSharpeRatio: 0,
		MinNegPnl: 0.25,
		MaxDrawDown: 0.25,
		PotentialRisk: 0.2,
		RiskOverPnl: 0.15,
		EffVar: 0.15,
		StdNegEff: 0,
		StdQuantity: 0,
		SortinoRatio: 0,
		DivConsistency: 0,
		TradeDays: 0,
		TradeCount: 0,
		ActiveRatio: 0,
	},
	consistency: {
		AllTimePnl: 0,
		AvgDailyPnl: 0,
		WinRatio: 0,
		WinningDayRatio: 0,
		Streak: 0,
		PnlEfficiency: 0,
		EffSharpeRatio: 0,
		MinNegPnl: 0,
		MaxDrawDown: 0,
		PotentialRisk: 0,
		RiskOverPnl: 0,
		EffVar: 0,
		StdNegEff: 0.35,
		StdQuantity: 0.35,
		SortinoRatio: 0.3,
		DivConsistency: 0,
		TradeDays: 0,
		TradeCount: 0,
		ActiveRatio: 0,
	},
	activeness: {
		AllTimePnl: 0,
		AvgDailyPnl: 0,
		WinRatio: 0,
		WinningDayRatio: 0,
		Streak: 0,
		PnlEfficiency: 0,
		EffSharpeRatio: 0,
		MinNegPnl: 0,
		MaxDrawDown: 0,
		PotentialRisk: 0,
		RiskOverPnl: 0,
		EffVar: 0,
		StdNegEff: 0,
		StdQuantity: 0,
		SortinoRatio: 0,
		DivConsistency: 0,
		TradeDays: 0.4,
		TradeCount: 0.35,
		ActiveRatio: 0.25,
	},
};

export const DEFAULT_DIMENSION_WEIGHTS: Record<TqDimension, number> = {
	profitability: 0.5,
	risk_control: 0.35,
	consistency: 0.1,
	activeness: 0.05,
};
