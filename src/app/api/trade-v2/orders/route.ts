import { NextResponse } from "next/server";

import { requireMembershipCapability } from "@/lib/membership/guard";
import { requireTradeUser } from "@/lib/trade/require-user";
import type { TradeV2OrdersApiResponse } from "@/lib/trade-v2/api-types";
import { listV2Orders } from "@/lib/trade-v2/order-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
	const ctx = await requireTradeUser();
	if (ctx instanceof NextResponse) return ctx;
	const { supabase, userId } = ctx;

	const membership = await requireMembershipCapability(supabase, userId, "sim_trading");
	if (membership instanceof NextResponse) return membership;

	const url = new URL(request.url);
	const accountType = url.searchParams.get("accountType") === "credit" ? "credit" : "normal";
	const result = await listV2Orders(supabase, userId, accountType);
	return NextResponse.json<TradeV2OrdersApiResponse>(result.body, { status: result.status });
}
