import { NextResponse } from "next/server";

import { requireMembershipCapability } from "@/lib/membership/guard";
import { requireTradeUser } from "@/lib/trade/require-user";
import type {
	ApiErrorResponse,
	TradeV2RiskMessagesReadApiResponse,
} from "@/lib/trade-v2/api-types";
import { markRiskMessagesRead } from "@/lib/trade-v2/risk-messages";

export const runtime = "nodejs";

type MarkReadRequestBody = {
	ids?: string[];
	all?: boolean;
};

type MarkReadSuccessResponse = TradeV2RiskMessagesReadApiResponse;
type MarkReadErrorResponse = ApiErrorResponse;

export async function POST(request: Request) {
	const ctx = await requireTradeUser();
	if (ctx instanceof NextResponse) return ctx;

	const membership = await requireMembershipCapability(ctx.supabase, ctx.userId, "sim_trading");
	if (membership instanceof NextResponse) return membership;

	let body: MarkReadRequestBody;
	try {
		body = (await request.json()) as MarkReadRequestBody;
	} catch {
		return NextResponse.json<MarkReadErrorResponse>({ success: false, error: "请求体不是合法 JSON" }, { status: 400 });
	}

	try {
		if (body.all === true) {
			await markRiskMessagesRead(ctx.supabase, ctx.userId, "all");
		} else {
			const ids = Array.isArray(body.ids) ? body.ids.filter((v): v is string => typeof v === "string") : [];
			await markRiskMessagesRead(ctx.supabase, ctx.userId, ids);
		}
		return NextResponse.json<MarkReadSuccessResponse>({ success: true });
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "标记已读失败" } satisfies MarkReadErrorResponse,
			{ status: 500 },
		);
	}
}
