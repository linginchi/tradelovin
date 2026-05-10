import { NextResponse } from "next/server";

import { requireMembershipCapability } from "@/lib/membership/guard";
import { requireTradeUser } from "@/lib/trade/require-user";
import type { ApiErrorResponse, TradeV2CancelApiResponse } from "@/lib/trade-v2/api-types";
import { cancelV2Order } from "@/lib/trade-v2/order-service";

export const runtime = "nodejs";

type Body = { orderId?: unknown; accountType?: unknown };

export async function POST(request: Request) {
	const ctx = await requireTradeUser();
	if (ctx instanceof NextResponse) return ctx;
	const { supabase, userId } = ctx;

	const membership = await requireMembershipCapability(supabase, userId, "sim_trading");
	if (membership instanceof NextResponse) return membership;

	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return NextResponse.json<ApiErrorResponse>({ success: false, error: "请求体不是合法 JSON" }, { status: 400 });
	}
	const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
	const accountType = body.accountType === "credit" ? "credit" : "normal";
	if (!orderId) {
		return NextResponse.json<ApiErrorResponse>({ success: false, error: "orderId 不能为空" }, { status: 400 });
	}

	const result = await cancelV2Order(supabase, userId, orderId, accountType);
	return NextResponse.json<TradeV2CancelApiResponse>(result.body, { status: result.status });
}
