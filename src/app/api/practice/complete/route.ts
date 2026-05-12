import { NextResponse } from "next/server";

import { getPracticeLevel } from "@/lib/practice/levels";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

type StepResultInput = {
	stepId?: unknown;
	correct?: unknown;
	scoreDelta?: unknown;
};

type Body = {
	levelId?: unknown;
	finalScore?: unknown;
	stepResults?: unknown;
};

export async function POST(request: Request) {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) return auth;

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

	const rawStepResults = Array.isArray(body.stepResults) ? body.stepResults : [];
	const scoreFromSteps = rawStepResults.reduce((sum, step) => {
		const stepRecord = (step ?? {}) as StepResultInput;
		const delta = typeof stepRecord.scoreDelta === "number" ? stepRecord.scoreDelta : Number(stepRecord.scoreDelta);
		return sum + (Number.isFinite(delta) ? delta : 0);
	}, 0);
	const finalScore = typeof body.finalScore === "number" ? body.finalScore : Number(body.finalScore);
	const normalizedFinalScore = Number.isFinite(finalScore) ? finalScore : scoreFromSteps;

	// P0 仅返回 mock，P3 接入 practice_scores / practice_logs 持久化。
	return NextResponse.json({
		success: true,
		newTotalScore: normalizedFinalScore,
		completedLevels: [
			{
				levelId,
				bestScore: normalizedFinalScore,
				completedAt: new Date().toISOString(),
			},
		],
		unlockedNext: null,
	});
}
