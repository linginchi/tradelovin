import type { RiskFailureMeta } from "@/lib/trade-v2/failure-types";

export type FailureMeta = RiskFailureMeta;

export type FailureSignal = {
	code?: string | null;
	content?: string;
	meta?: FailureMeta;
};

export function extractRiskSymbol(content: string): string {
	const matched = String(content ?? "").match(/\b\d{6}\.(?:SH|SZ)\b/i)?.[0] ?? "";
	return matched.toUpperCase();
}

export function resolveFailureSymbol(signal: FailureSignal): string {
	return String(signal.meta?.symbol ?? "").toUpperCase() || extractRiskSymbol(String(signal.content ?? ""));
}

export function resolveFailurePriority(signal: FailureSignal): number {
	const code = String(signal.code ?? "");
	let score = 0;
	if (code === "ORDER_REJECTED") score += 45;
	if (code === "BROKER_SIM_DROP") score += 35;

	const tier = signal.meta?.executionTier ?? "";
	if (tier === "blocked") score += 35;
	else if (tier === "thin") score += 24;
	else if (tier === "queue") score += 16;
	else if (tier === "normal") score += 10;
	else if (tier === "aggressive") score += 6;

	const liq = signal.meta?.liquidityScore;
	if (typeof liq === "number") {
		if (liq <= 0.25) score += 28;
		else if (liq <= 0.4) score += 20;
		else if (liq <= 0.6) score += 10;
	}

	const gap = Math.abs(Number(signal.meta?.priceGapBps ?? 0));
	if (Number.isFinite(gap) && gap > 0) {
		score += Math.min(20, Math.round(gap / 12));
	}
	return score;
}

export function formatFailurePriorityTagByScore(score: number): string {
	if (score >= 85) return "高风险";
	if (score >= 60) return "中高风险";
	if (score >= 35) return "中风险";
	return "低风险";
}

export function formatFailurePriorityTag(signal: FailureSignal): string {
	return formatFailurePriorityTagByScore(resolveFailurePriority(signal));
}
