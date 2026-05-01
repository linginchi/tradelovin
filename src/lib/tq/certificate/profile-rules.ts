import type { MembershipTier } from "@/lib/membership/types";
import type { TqFeatureSnapshot, TqScoreSnapshot } from "@/lib/tq/radar-contract";

export type TqProfileNarrative = {
	tier: MembershipTier;
	label: "优秀交易员" | "稳健交易员" | "成长型交易员" | "待提升交易员";
	summary: string;
	strengths: string[];
	risks: string[];
	suggestions: string[];
};

function rankLabel(score: number): TqProfileNarrative["label"] {
	if (score >= 80) return "优秀交易员";
	if (score >= 65) return "稳健交易员";
	if (score >= 50) return "成长型交易员";
	return "待提升交易员";
}

function topDimensions(score: TqScoreSnapshot): string[] {
	const items = [
		{ id: "盈利能力", value: score.dimensions.profitability },
		{ id: "风险控制", value: score.dimensions.riskControl },
		{ id: "稳定性", value: score.dimensions.consistency },
		{ id: "活跃程度", value: score.dimensions.activeness },
	];
	return items
		.sort((a, b) => b.value - a.value)
		.slice(0, 2)
		.map((x) => x.id);
}

function readFeature(features: TqFeatureSnapshot[], name: string): number {
	const hit = features.find((item) => item.featureName === name);
	return Number(hit?.normScore ?? 0);
}

export function buildTieredNarrative(
	tier: MembershipTier,
	score: TqScoreSnapshot,
	features: TqFeatureSnapshot[],
): TqProfileNarrative {
	const label = rankLabel(score.totalScore);
	const top2 = topDimensions(score);
	const maxDrawdownScore = readFeature(features, "MaxDrawDown");
	const winRatioScore = readFeature(features, "WinRatio");
	const activeScore = readFeature(features, "ActiveRatio");
	const sharpeScore = readFeature(features, "EffSharpeRatio");

	const baseSummary = `当前 TQ 为 ${score.totalScore.toFixed(2)}，评级为${label}，优势主要集中在${top2.join("、")}。`;
	const baseStrengths = [
		`盈利能力分 ${score.dimensions.profitability.toFixed(1)}，风险控制分 ${score.dimensions.riskControl.toFixed(1)}。`,
		`稳定性分 ${score.dimensions.consistency.toFixed(1)}，活跃度分 ${score.dimensions.activeness.toFixed(1)}。`,
	];
	const baseRisks = [
		maxDrawdownScore < 50 ? "回撤控制偏弱，极端行情下账户回撤放大风险较高。" : "回撤控制总体稳定，建议持续监测极端回撤日。",
		activeScore < 40 ? "交易活跃度偏低，样本不足可能影响评分稳定性。" : "交易活跃度充足，可持续观察策略一致性。",
	];
	const baseSuggestions = [
		winRatioScore < 50 ? "优先优化入场过滤条件，减少低胜率交易。" : "继续保持胜率优势，优化盈亏比以提升总分。",
		"建立固定复盘模板，按周跟踪盈利、回撤与执行偏差。",
	];

	if (tier === "T1") {
		return {
			tier,
			label,
			summary: baseSummary,
			strengths: baseStrengths.slice(0, 1),
			risks: baseRisks.slice(0, 1),
			suggestions: baseSuggestions.slice(0, 1),
		};
	}

	if (tier === "T2") {
		return {
			tier,
			label,
			summary: `${baseSummary} 当前证书已包含核心维度与分组雷达洞察。`,
			strengths: baseStrengths,
			risks: baseRisks,
			suggestions: baseSuggestions,
		};
	}

	const advancedSuggestion =
		sharpeScore < 50
			? "建议按策略维度拆分夏普，区分波动来源并设置风控阈值。"
			: "建议引入多周期夏普与Sortino联合监控，进一步提升收益质量。";
	return {
		tier,
		label,
		summary: `${baseSummary} T3 版本提供特征级解释与进阶训练建议。`,
		strengths: [...baseStrengths, `效率夏普评分 ${sharpeScore.toFixed(1)}，可用于评估收益质量。`],
		risks: [...baseRisks, "当单周波动显著放大时，需降低仓位并收敛交易频率。"],
		suggestions: [...baseSuggestions, advancedSuggestion],
	};
}

