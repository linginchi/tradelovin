import type { TqPeriod, TqEnvironment } from "@/lib/tq/constants";

export type TqScoreSnapshot = {
	userId: string;
	environment: TqEnvironment;
	period: TqPeriod;
	totalScore: number;
	dimensions: {
		profitability: number;
		riskControl: number;
		consistency: number;
		activeness: number;
	};
	calcTime?: string;
};

export type TqFeatureSnapshot = {
	featureName: string;
	rawValue: number;
	normScore: number;
	calcTime?: string;
};

export type RadarAxis = {
	id: string;
	label: string;
	score: number;
	rawValue: number;
	sourceFeature: string;
};

export type RadarGroup = {
	id: "core" | "profitability" | "riskControl" | "activeness" | "consistency";
	label: string;
	axes: RadarAxis[];
};

export type TqRadarContract = {
	version: "tqscore-aligned-v1";
	totalScore: number;
	groups: RadarGroup[];
};

type AxisMapping = {
	id: string;
	label: string;
	sourceFeatureCandidates: string[];
};

const PROFITABILITY_AXES: AxisMapping[] = [
	{ id: "biggestProfitRatio", label: "最大盈利比例", sourceFeatureCandidates: ["AllTimePnl"] },
	{ id: "rollPrice", label: "已了结净资产", sourceFeatureCandidates: ["PnlEfficiency"] },
	{ id: "unitPrice", label: "净资产", sourceFeatureCandidates: ["AvgDailyPnl"] },
	{ id: "consecutiveWinningPositions", label: "连赢笔数", sourceFeatureCandidates: ["Streak"] },
	{ id: "consecutiveWinningDays", label: "连赢天数", sourceFeatureCandidates: ["Streak"] },
	{ id: "positionsWinRatio", label: "胜率笔数", sourceFeatureCandidates: ["WinRatio"] },
	{ id: "annualSharpeRatio", label: "年化夏普比率", sourceFeatureCandidates: ["EffSharpeRatio"] },
];

const RISK_AXES: AxisMapping[] = [
	{ id: "valueAtRisk", label: "风险值", sourceFeatureCandidates: ["EffVar"] },
	{ id: "maxDrawdown", label: "净值最大回撤", sourceFeatureCandidates: ["MaxDrawDown"] },
	{ id: "stdNegativePnlRate", label: "损失波动", sourceFeatureCandidates: ["StdNegEff"] },
	{ id: "biggestLossRatio", label: "最大损失比例", sourceFeatureCandidates: ["MinNegPnl"] },
	{ id: "averageOvernightOpenPosition", label: "平均过夜仓位", sourceFeatureCandidates: ["PotentialRisk"] },
	{ id: "averageMaximumOpenPosition", label: "平均最大仓位", sourceFeatureCandidates: ["PotentialRisk"] },
];

const ACTIVENESS_AXES: AxisMapping[] = [
	{ id: "slidingActiveTradingRatio", label: "滑动交易活跃度", sourceFeatureCandidates: ["ActiveRatio"] },
	{ id: "loginPerDay", label: "平均每天登录次数", sourceFeatureCandidates: ["TradeCount"] },
	{ id: "tradesPerDay", label: "平均每天交易次数", sourceFeatureCandidates: ["TradeCount"] },
	{ id: "loginsCount", label: "登录次数", sourceFeatureCandidates: ["TradeDays"] },
	{ id: "tradeDaysCount", label: "交易天数", sourceFeatureCandidates: ["TradeDays"] },
	{ id: "tradesCount", label: "交易总次数", sourceFeatureCandidates: ["TradeCount"] },
];

const CONSISTENCY_AXES: AxisMapping[] = [
	{ id: "stdOpenPositionsQty", label: "持仓数量波动", sourceFeatureCandidates: ["StdQuantity"] },
	{ id: "avgOverNightOpenPositions", label: "平均过夜仓位", sourceFeatureCandidates: ["PotentialRisk"] },
	{ id: "stdOpenPositionsDuration", label: "持仓时长波动", sourceFeatureCandidates: ["StdNegEff"] },
	{ id: "avgDurations", label: "平均持仓时间", sourceFeatureCandidates: ["SortinoRatio"] },
];

function round2(v: number): number {
	if (!Number.isFinite(v)) return 0;
	return Math.round(v * 100) / 100;
}

function readAxisScore(map: Map<string, TqFeatureSnapshot>, candidates: string[]): RadarAxis {
	for (const feature of candidates) {
		const hit = map.get(feature);
		if (hit) {
			return {
				id: feature,
				label: feature,
				score: round2(hit.normScore),
				rawValue: round2(hit.rawValue),
				sourceFeature: feature,
			};
		}
	}
	return {
		id: candidates[0] ?? "unknown",
		label: candidates[0] ?? "unknown",
		score: 0,
		rawValue: 0,
		sourceFeature: candidates[0] ?? "unknown",
	};
}

function mapGroup(
	groupId: RadarGroup["id"],
	label: string,
	axes: AxisMapping[],
	map: Map<string, TqFeatureSnapshot>,
): RadarGroup {
	return {
		id: groupId,
		label,
		axes: axes.map((axis) => {
			const resolved = readAxisScore(map, axis.sourceFeatureCandidates);
			return {
				id: axis.id,
				label: axis.label,
				score: resolved.score,
				rawValue: resolved.rawValue,
				sourceFeature: resolved.sourceFeature,
			};
		}),
	};
}

export function buildTqRadarContract(
	score: TqScoreSnapshot,
	features: TqFeatureSnapshot[],
): TqRadarContract {
	const featureMap = new Map(features.map((item) => [item.featureName, item]));
	const core: RadarGroup = {
		id: "core",
		label: "TQScore",
		axes: [
			{
				id: "riskControl",
				label: "风险控制",
				score: round2(score.dimensions.riskControl),
				rawValue: round2(score.dimensions.riskControl),
				sourceFeature: "dimension:risk_control",
			},
			{
				id: "profitability",
				label: "盈利能力",
				score: round2(score.dimensions.profitability),
				rawValue: round2(score.dimensions.profitability),
				sourceFeature: "dimension:profitability",
			},
			{
				id: "consistency",
				label: "稳定性",
				score: round2(score.dimensions.consistency),
				rawValue: round2(score.dimensions.consistency),
				sourceFeature: "dimension:consistency",
			},
			{
				id: "activeness",
				label: "活跃程度",
				score: round2(score.dimensions.activeness),
				rawValue: round2(score.dimensions.activeness),
				sourceFeature: "dimension:activeness",
			},
		],
	};

	return {
		version: "tqscore-aligned-v1",
		totalScore: round2(score.totalScore),
		groups: [
			core,
			mapGroup("profitability", "盈利能力", PROFITABILITY_AXES, featureMap),
			mapGroup("riskControl", "风险控制", RISK_AXES, featureMap),
			mapGroup("activeness", "活跃程度", ACTIVENESS_AXES, featureMap),
			mapGroup("consistency", "稳定性", CONSISTENCY_AXES, featureMap),
		],
	};
}

