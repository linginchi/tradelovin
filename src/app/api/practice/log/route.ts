import { NextResponse } from "next/server";

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
	logs?: unknown;
};

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

	const rawLogs = Array.isArray(body.logs) ? body.logs : [];
	if (rawLogs.length === 0) {
		return NextResponse.json({ success: true, inserted: 0 });
	}
	const now = new Date().toISOString();
	const practiceLogs = rawLogs
		.map((item) => {
			const row = (item ?? {}) as PracticeLogInput;
			const levelId = typeof row.levelId === "string" ? row.levelId : "";
			const stepId = typeof row.stepId === "string" ? row.stepId : "";
			if (!levelId || !stepId) return null;
			const createdAt = typeof row.timestamp === "string" && row.timestamp ? row.timestamp : now;
			const scoreDeltaNum = Number(row.scoreDelta);
			const scoreDelta = Number.isFinite(scoreDeltaNum) ? Math.trunc(scoreDeltaNum) : 0;
			return {
				user_id: userId,
				level_id: levelId,
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

	if (practiceLogs.length === 0) {
		return NextResponse.json({ success: true, inserted: 0 });
	}

	const { error } = await supabase.from("practice_logs").insert(practiceLogs);
	if (error) {
		return NextResponse.json({ success: false, error: error.message }, { status: 500 });
	}
	return NextResponse.json({ success: true, inserted: practiceLogs.length });
}
