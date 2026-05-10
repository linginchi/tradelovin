import { NextResponse } from "next/server";

import { requireMembershipCapability } from "@/lib/membership/guard";
import { requireTradeUser } from "@/lib/trade/require-user";
import type { ApiErrorResponse, TradeV2PersonalResourcesApiResponse } from "@/lib/trade-v2/api-types";
import { listPersonalResources } from "@/lib/trade-v2/resources";

export const runtime = "nodejs";

export async function GET() {
	const ctx = await requireTradeUser();
	if (ctx instanceof NextResponse) return ctx;
	const { supabase, userId } = ctx;

	const membership = await requireMembershipCapability(supabase, userId, "sim_trading");
	if (membership instanceof NextResponse) return membership;

	try {
		const data = await listPersonalResources(supabase, userId);
		return NextResponse.json<TradeV2PersonalResourcesApiResponse>({
			success: true,
			data,
		});
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "读取个人资源失败" } satisfies ApiErrorResponse,
			{ status: 500 },
		);
	}
}
