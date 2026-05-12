import { NextResponse } from "next/server";

import { getPracticeLevel } from "@/lib/practice/levels";
import { getNextStage, getStageRequirementHint, getStageByKey, getUserStage, stageRank } from "@/lib/practice/stage";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

type PracticeLogInput = {
	levelId?: unknown;
	stepId?: unknown;
	userInput?: unknown;
	correct?: unknown;
	scoreDelta?: unknown;
	timestamp?: unknown;
};

type Body = {
	levelId?: unknown;
	finalScore?: unknown;
	logs?: unknown;
};

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

export async function POST(request: Request) {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) return auth;
	const { supabase, userId } = auth;

	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return NextResponse.json({ success: false, error: "请求体不是合法 JSON" }, { status: 400 });
	}

	const levelId = typeof body.levelId === "string" ? body.levelId.trim() : "";
	if (!levelId) {
		return NextResponse.json({ success: false, error: "levelId 必填" }, { status: 400 });
	}
	const level = getPracticeLevel(levelId);
	if (!level) {
		return NextResponse.json({ success: false, error: "关卡不存在" }, { status: 404 });
	}

	const finalScore = typeof body.finalScore === "number" ? body.finalScore : Number(body.finalScore);
	if (!Number.isFinite(finalScore)) {
		return NextResponse.json({ success: false, error: "finalScore 必须为数字" }, { status: 400 });
	}
	const normalizedFinalScore = Math.trunc(finalScore);
	const now = new Date().toISOString();

	const rawLogs = Array.isArray(body.logs) ? body.logs : [];
	const practiceLogs = rawLogs
		.map((item) => {
			const row = (item ?? {}) as PracticeLogInput;
			const stepId = typeof row.stepId === "string" ? row.stepId : "";
			if (!stepId) return null;
			const logLevelId = typeof row.levelId === "string" && row.levelId ? row.levelId : levelId;
			const createdAt = typeof row.timestamp === "string" && row.timestamp ? row.timestamp : now;
			const scoreDeltaNum = Number(row.scoreDelta);
			const scoreDelta = Number.isFinite(scoreDeltaNum) ? Math.trunc(scoreDeltaNum) : 0;
			return {
				user_id: userId,
				level_id: logLevelId,
				step_id: stepId,
				user_input:
					typeof row.userInput === "object" && row.userInput !== null
						? (row.userInput as Record<string, unknown>)
						: null,
				correct: typeof row.correct === "boolean" ? row.correct : null,
				score_delta: scoreDelta,
				created_at: createdAt,
			};
		})
		.filter((item): item is NonNullable<typeof item> => item !== null);

	const { data: currentScore, error: fetchScoreError } = await supabase
		.from("practice_scores")
		.select("total_score, completed_levels, current_stage")
		.eq("user_id", userId)
		.maybeSingle();
	if (fetchScoreError) {
		return NextResponse.json({ success: false, error: fetchScoreError.message }, { status: 500 });
	}

	const oldTotal = Number(currentScore?.total_score ?? 0);
	const newTotal = oldTotal + normalizedFinalScore;
	const completedLevels = normalizeCompletedLevels(currentScore?.completed_levels);
	const existing = completedLevels.find((item) => item.levelId === levelId);
	const bestScore = existing ? Math.max(existing.bestScore, normalizedFinalScore) : normalizedFinalScore;
	const nextCompleted = [
		...completedLevels.filter((item) => item.levelId !== levelId),
		{
			levelId,
			bestScore,
			completedAt: now,
		},
	];
	const stageNow = getStageByKey(typeof currentScore?.current_stage === "string" ? currentScore.current_stage : null);
	const stageByProgress = getUserStage(newTotal, nextCompleted.length);
	const shouldUpgrade = stageRank(stageByProgress.key) > stageRank(stageNow.key);
	const persistedStage = shouldUpgrade ? stageByProgress : stageNow;
	const nextStage = getNextStage(persistedStage.key);

	const { error: upsertScoreError } = await supabase.from("practice_scores").upsert(
		{
			user_id: userId,
			total_score: newTotal,
			completed_levels: nextCompleted,
			current_stage: persistedStage.key,
			last_practice: now,
			updated_at: now,
		},
		{ onConflict: "user_id" },
	);
	if (upsertScoreError) {
		return NextResponse.json({ success: false, error: upsertScoreError.message }, { status: 500 });
	}

	if (practiceLogs.length > 0) {
		const { error: insertLogError } = await supabase.from("practice_logs").insert(practiceLogs);
		if (insertLogError) {
			return NextResponse.json({ success: false, error: insertLogError.message }, { status: 500 });
		}
	}

	return NextResponse.json({
		success: true,
		newTotalScore: newTotal,
		completedLevels: nextCompleted,
		currentStage: { ...persistedStage, stageKey: persistedStage.key },
		newStage: shouldUpgrade ? { ...stageByProgress, stageKey: stageByProgress.key } : null,
		nextStage: nextStage
			? {
					...nextStage,
					stageKey: nextStage.key,
					requirementHint: getStageRequirementHint(nextStage, newTotal, nextCompleted.length),
				}
			: null,
	});
}
