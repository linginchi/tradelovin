import { NextResponse } from "next/server";

import { requireMembershipCapability } from "@/lib/membership/guard";
import { requireTradeUser } from "@/lib/trade/require-user";
import type { ApiErrorResponse, TradeV2ConditionsTriggerApiResponse } from "@/lib/trade-v2/api-types";
import { triggerConditions } from "@/lib/trade-v2/watch-conditions";

export const runtime = "nodejs";

export async function POST() {
	const ctx = await requireTradeUser();
	if (ctx instanceof NextResponse) return ctx;

	const membership = await requireMembershipCapability(ctx.supabase, ctx.userId, "sim_trading");
	if (membership instanceof NextResponse) return membership;

	try {
		const data = await triggerConditions(ctx.supabase, ctx.userId);
		return NextResponse.json<TradeV2ConditionsTriggerApiResponse>({
			success: true,
			data,
		});
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "条件单触发失败" } satisfies ApiErrorResponse,
			{ status: 500 },
		);
	}
}
