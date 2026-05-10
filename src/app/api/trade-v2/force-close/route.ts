import { NextResponse } from "next/server";

import { requireMembershipCapability } from "@/lib/membership/guard";
import { requireTradeUser } from "@/lib/trade/require-user";
import type { ApiErrorResponse, TradeV2ForceCloseApiResponse } from "@/lib/trade-v2/api-types";
import { runForceCloseJob } from "@/lib/trade-v2/force-close";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST() {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) return auth;

	const membership = await requireMembershipCapability(auth.supabase, auth.userId, "sim_trading");
	if (membership instanceof NextResponse) return membership;

	const service = getServiceSupabase();
	if (!service) {
		return NextResponse.json<ApiErrorResponse>({ success: false, error: "服务不可用：缺少 service role" }, { status: 503 });
	}

	try {
		const data = await runForceCloseJob(service, {
			scope: "self",
			triggerSource: "manual",
			triggeredBy: auth.userId,
		});
		return NextResponse.json<TradeV2ForceCloseApiResponse>({
			success: true,
			data,
		});
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "强平失败" } satisfies ApiErrorResponse,
			{ status: 500 },
		);
	}
}
