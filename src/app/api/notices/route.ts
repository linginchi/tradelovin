import { NextResponse } from "next/server";

import { listNoticesForUser } from "@/lib/notices/store";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function GET() {
	const ctx = await requireTradeUser();
	if (ctx instanceof NextResponse) return ctx;

	try {
		const data = await listNoticesForUser(ctx.supabase, ctx.userId);
		return NextResponse.json({ success: true, data });
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "读取通知失败" },
			{ status: 500 },
		);
	}
}
