import { NextResponse } from "next/server";

import { requireMembershipCapability } from "@/lib/membership/guard";
import { requireTradeUser } from "@/lib/trade/require-user";
import type { ApiErrorResponse, TradeV2PublicResourcesApiResponse } from "@/lib/trade-v2/api-types";
import { listPublicResources } from "@/lib/trade-v2/resources";

export const runtime = "nodejs";

export async function GET() {
	const ctx = await requireTradeUser();
	if (ctx instanceof NextResponse) return ctx;
	const { supabase, userId } = ctx;

	const membership = await requireMembershipCapability(supabase, userId, "sim_trading");
	if (membership instanceof NextResponse) return membership;

	try {
		const data = await listPublicResources(supabase);
		return NextResponse.json<TradeV2PublicResourcesApiResponse>({
			success: true,
			data,
		});
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "读取公共资源失败" } satisfies ApiErrorResponse,
			{ status: 500 },
		);
	}
}
