import { NextResponse } from "next/server";

import { canOpenCoachDesk, coachBadgePayload } from "@/lib/coach/guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function GET() {
	const ctx = await requireTradeUser();
	if (ctx instanceof NextResponse) return ctx;
	const service = getServiceSupabase();
	if (!service) {
		return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	}
	try {
		const access = await canOpenCoachDesk(service, ctx.userId);
		return NextResponse.json({
			success: true,
			data: {
				isCoach: access.isCoach,
				canOpenDesk: access.canOpenDesk,
				badge: access.isCoach ? coachBadgePayload() : null,
			},
		});
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "读取教练身份失败" },
			{ status: 500 },
		);
	}
}
