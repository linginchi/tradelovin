import { NextResponse } from "next/server";

import { requireMembershipCapability } from "@/lib/membership/guard";
import { requireTradeUser } from "@/lib/trade/require-user";
import type { ApiAckResponse, ApiErrorResponse } from "@/lib/trade-v2/api-types";
import { deleteWatchlist } from "@/lib/trade-v2/watch-conditions";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_: Request, { params }: Params) {
	const ctx = await requireTradeUser();
	if (ctx instanceof NextResponse) return ctx;

	const membership = await requireMembershipCapability(ctx.supabase, ctx.userId, "sim_trading");
	if (membership instanceof NextResponse) return membership;

	const { id } = await params;
	if (!id) {
		return NextResponse.json<ApiErrorResponse>({ success: false, error: "id 不能为空" }, { status: 400 });
	}

	try {
		await deleteWatchlist(ctx.supabase, ctx.userId, id);
		return NextResponse.json<ApiAckResponse>({ success: true });
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "删除监控失败" } satisfies ApiErrorResponse,
			{ status: 400 },
		);
	}
}
