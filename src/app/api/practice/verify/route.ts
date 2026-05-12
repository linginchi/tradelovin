import { NextResponse } from "next/server";

import { verifyPracticeStep } from "@/lib/practice/verify";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

type Body = {
	levelId?: unknown;
	stepId?: unknown;
	userInput?: unknown;
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
	const stepId = typeof body.stepId === "string" ? body.stepId.trim() : "";
	if (!levelId || !stepId) {
		return NextResponse.json({ success: false, error: "levelId 与 stepId 必填" }, { status: 400 });
	}

	const result = verifyPracticeStep(levelId, stepId, body.userInput);
	if (!result.expectedValue) {
		return NextResponse.json(
			{
				success: false,
				...result,
			},
			{ status: 404 },
		);
	}
	return NextResponse.json({
		success: true,
		...result,
	});
}
