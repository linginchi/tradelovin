import type { SupabaseClient } from "@supabase/supabase-js";

import { buildAssessmentDashboard } from "@/lib/assessment/build-dashboard";
import type {
	AssessmentAdviceItem,
	AssessmentDashboardView,
	AssessmentModule,
	AssessmentScoreSnapshot,
} from "@/lib/assessment/types";
import { getUpgradePreview } from "@/lib/membership/upgrade-gate";
import { canUseLabAccess, canUseTqReport, ensureCurrentMembership } from "@/lib/membership/v2";
import { getServiceSupabase } from "@/lib/supabase/service";
import { UPGRADE_TQ_ENV, UPGRADE_TQ_PERIOD } from "@/lib/membership/upgrade-rules";
import { TQ_MIN_TRADES_FOR_SCORE } from "@/lib/tq/constants";
import { ensureTqCalculated } from "@/lib/tq/engine";

type AdviceTemplate = {
	key: string;
	title: string;
	condition_json: { feature?: string; op?: string; value?: number };
	advice_template: string;
	course_hint: string | null;
};

function templateHits(template: AdviceTemplate, featureMap: Record<string, number>): boolean {
	const feature = String(template.condition_json?.feature ?? "");
	const op = String(template.condition_json?.op ?? "");
	const value = Number(template.condition_json?.value ?? Number.NaN);
	const current = Number(featureMap[feature] ?? Number.NaN);
	if (!feature || !op || !Number.isFinite(value) || !Number.isFinite(current)) return false;
	if (op === "lt") return current < value;
	if (op === "lte") return current <= value;
	if (op === "gt") return current > value;
	if (op === "gte") return current >= value;
	return false;
}

const EMPTY_SCORE: AssessmentScoreSnapshot = {
	total: 0,
	eligible: false,
	tradeCount: 0,
	minTrades: TQ_MIN_TRADES_FOR_SCORE.sim,
	dimensions: { profitability: 0, riskControl: 0, consistency: 0, activeness: 0 },
};

async function loadScore(userId: string): Promise<AssessmentScoreSnapshot> {
	const srv = getServiceSupabase();
	if (!srv) return EMPTY_SCORE;
	try {
		await ensureTqCalculated(srv, { userId, environment: UPGRADE_TQ_ENV, period: UPGRADE_TQ_PERIOD });
	} catch (error) {
		console.warn("[assessment] ensureTqCalculated skipped", { userId, error });
	}

	const [{ data: scoreRows }, { data: featureRows }] = await Promise.all([
		srv
			.from("tq_scores")
			.select("dimension,score,total_score")
			.eq("user_id", userId)
			.eq("environment", UPGRADE_TQ_ENV)
			.eq("period", UPGRADE_TQ_PERIOD),
		srv
			.from("tq_features")
			.select("feature_name,raw_value")
			.eq("user_id", userId)
			.eq("environment", UPGRADE_TQ_ENV)
			.eq("period", UPGRADE_TQ_PERIOD),
	]);

	const dimensions = { ...EMPTY_SCORE.dimensions };
	let total = 0;
	for (const row of scoreRows ?? []) {
		if (row.dimension === "profitability") dimensions.profitability = Number(row.score ?? 0);
		if (row.dimension === "risk_control") dimensions.riskControl = Number(row.score ?? 0);
		if (row.dimension === "consistency") dimensions.consistency = Number(row.score ?? 0);
		if (row.dimension === "activeness") dimensions.activeness = Number(row.score ?? 0);
		total = Number(row.total_score ?? total);
	}
	const tradeCount = Number(
		(featureRows ?? []).find((row) => row.feature_name === "TradeCount")?.raw_value ?? 0,
	);
	const minTrades = TQ_MIN_TRADES_FOR_SCORE[UPGRADE_TQ_ENV];
	return {
		total: Number.isFinite(total) ? total : 0,
		tradeCount: Number.isFinite(tradeCount) ? tradeCount : 0,
		minTrades,
		eligible: tradeCount >= minTrades,
		dimensions,
	};
}

async function loadAdvice(userId: string): Promise<AssessmentAdviceItem[]> {
	const srv = getServiceSupabase();
	if (!srv) return [];
	const [{ data: featureRows }, { data: templates }] = await Promise.all([
		srv
			.from("tq_features")
			.select("feature_name,raw_value")
			.eq("user_id", userId)
			.eq("environment", UPGRADE_TQ_ENV)
			.eq("period", UPGRADE_TQ_PERIOD),
		srv.from("tq_advice_templates").select("key,title,condition_json,advice_template,course_hint").eq("enabled", true),
	]);
	const featureMap: Record<string, number> = {};
	for (const row of featureRows ?? []) {
		featureMap[String(row.feature_name)] = Number(row.raw_value ?? 0);
	}
	return ((templates ?? []) as AdviceTemplate[])
		.filter((template) => templateHits(template, featureMap))
		.map((template) => ({
			key: template.key,
			title: template.title,
			text: template.advice_template,
			courseHint: template.course_hint,
		}));
}

async function loadLabSessions(userId: string): Promise<Array<{ riskThemes: string[] }>> {
	const srv = getServiceSupabase();
	if (!srv) return [];
	const { data, error } = await srv
		.from("lab_sessions")
		.select("output_json")
		.eq("user_id", userId)
		.eq("session_type", "diagnose")
		.order("created_at", { ascending: false })
		.limit(10);
	if (error) {
		console.warn("[assessment] lab_sessions read failed", { userId, error: error.message });
		return [];
	}
	return (data ?? []).map((row) => {
		const json = row.output_json as { riskThemes?: unknown } | null;
		const themes = Array.isArray(json?.riskThemes)
			? json.riskThemes.map((item) => String(item).trim()).filter(Boolean)
			: [];
		return { riskThemes: themes };
	});
}

export async function loadAssessmentDashboard(
	supabase: SupabaseClient,
	userId: string,
	module: AssessmentModule,
): Promise<AssessmentDashboardView> {
	const membership = await ensureCurrentMembership(supabase, userId);
	const adviceLocked = !membership || !canUseTqReport(membership);
	const labAccess = Boolean(membership && canUseLabAccess(membership));

	let nextPlan: "T1" | "T2" | "T3" | null = null;
	try {
		const preview = await getUpgradePreview(supabase, userId);
		nextPlan = preview.nextPlan;
	} catch {
		nextPlan = null;
	}

	const [score, advice, labSessions] = await Promise.all([
		loadScore(userId),
		adviceLocked ? Promise.resolve([] as AssessmentAdviceItem[]) : loadAdvice(userId),
		module === "lab" && labAccess ? loadLabSessions(userId) : Promise.resolve([]),
	]);

	return buildAssessmentDashboard({
		module,
		score,
		adviceLocked,
		advice,
		nextPlan,
		labAccess,
		labSessions,
	});
}
