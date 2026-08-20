import { NextResponse } from "next/server";

import { listCoachDirectory } from "@/lib/coach/service";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function GET() {
	const ctx = await requireTradeUser();
	if (ctx instanceof NextResponse) return ctx;
	const service = getServiceSupabase();
	if (!service) {
		return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	}
	try {
		const coaches = await listCoachDirectory(service);
		return NextResponse.json({ success: true, data: coaches });
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "读取教练列表失败" },
			{ status: 500 },
		);
	}
}
