import { NextResponse } from "next/server";
import { z } from "zod";

import { awardPoints, TQ_POINTS_RULES } from "@/lib/membership/points";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

const bodySchema = z.object({
	source: z.enum(["course_unit_passed", "invite_qualified"]),
	referenceId: z.string().optional(),
});

function ruleForSource(source: "course_unit_passed" | "invite_qualified") {
	if (source === "course_unit_passed") {
		return TQ_POINTS_RULES.courseUnitPassed;
	}
	return TQ_POINTS_RULES.inviteQualified;
}

export async function POST(request: Request) {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) return auth;

	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
	}
	const parsed = bodySchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ success: false, error: "参数错误" }, { status: 400 });
	}
	const rule = ruleForSource(parsed.data.source);
	const result = await awardPoints(srv, {
		userId: auth.userId,
		source: rule.source,
		delta: rule.points,
		dailyCap: rule.dailyCap,
		referenceId: parsed.data.referenceId,
		metadata: { source: parsed.data.source },
	});
	return NextResponse.json({ success: true, data: result });
}
