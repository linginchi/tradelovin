import { NextResponse } from "next/server";

import { getNextStage, getStageByKey, getStageRequirementHint, getUserStage } from "@/lib/practice/stage";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

type CompletedLevel = {
	levelId: string;
	bestScore: number;
	completedAt: string;
};

function normalizeCompletedLevels(input: unknown): CompletedLevel[] {
	if (!Array.isArray(input)) return [];
	return input
		.map((item) => {
			if (typeof item !== "object" || item === null) return null;
			const row = item as Record<string, unknown>;
			const levelId = typeof row.levelId === "string" ? row.levelId : "";
			const bestScore = Number(row.bestScore);
			const completedAt = typeof row.completedAt === "string" ? row.completedAt : "";
			if (!levelId || !Number.isFinite(bestScore)) return null;
			return { levelId, bestScore, completedAt: completedAt || new Date().toISOString() } satisfies CompletedLevel;
		})
		.filter((item): item is CompletedLevel => item !== null);
}

export async function GET() {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) return auth;
	const { supabase, userId } = auth;

	const { data, error } = await supabase
		.from("practice_scores")
		.select("total_score, completed_levels, current_stage")
		.eq("user_id", userId)
		.maybeSingle();
	if (error) {
		return NextResponse.json({ success: false, error: error.message }, { status: 500 });
	}
	const totalScore = Number(data?.total_score ?? 0);
	const completedLevels = normalizeCompletedLevels(data?.completed_levels);
	const computed = getUserStage(totalScore, completedLevels.length);
	const persisted = getStageByKey(typeof data?.current_stage === "string" ? data.current_stage : null);
	const currentStage = computed.key === persisted.key ? persisted : computed;
	const nextStage = getNextStage(currentStage.key);
	return NextResponse.json({
		success: true,
		currentStage: { ...currentStage, stageKey: currentStage.key },
		nextStage: nextStage
			? {
					...nextStage,
					stageKey: nextStage.key,
					requirementHint: getStageRequirementHint(nextStage, totalScore, completedLevels.length),
				}
			: null,
	});
}
