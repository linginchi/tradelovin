import { NextResponse } from "next/server";

import { requireMembershipCapability } from "@/lib/membership/guard";
import { requireTradeUser } from "@/lib/trade/require-user";
import type { ApiErrorResponse, ApiSuccessResponse } from "@/lib/trade-v2/api-types";
import type { RiskMessageRow } from "@/lib/trade-v2/failure-types";
import { listRiskMessages } from "@/lib/trade-v2/risk-messages";

export const runtime = "nodejs";

type RiskMessagesSuccessResponse = ApiSuccessResponse<RiskMessageRow[]>;
type RiskMessagesErrorResponse = ApiErrorResponse;

export async function GET(request: Request) {
	const ctx = await requireTradeUser();
	if (ctx instanceof NextResponse) return ctx;

	const membership = await requireMembershipCapability(ctx.supabase, ctx.userId, "sim_trading");
	if (membership instanceof NextResponse) return membership;

	const url = new URL(request.url);
	const unreadOnly = url.searchParams.get("unreadOnly") === "1";
	try {
		const data = await listRiskMessages(ctx.supabase, ctx.userId, unreadOnly);
		return NextResponse.json<RiskMessagesSuccessResponse>({ success: true, data });
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "读取风控消息失败" } satisfies RiskMessagesErrorResponse,
			{ status: 500 },
		);
	}
}
