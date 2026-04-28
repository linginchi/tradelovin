import { NextResponse } from "next/server";

import { cancelLimitOrderService } from "@/lib/trade/cancel-limit-order";
import { requireTradeUser } from "@/lib/trade/require-user";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = {
	orderId?: unknown;
};

export async function POST(request: Request) {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) {
		return auth;
	}

	let orderId = "";
	try {
		const j = (await request.json()) as Body;
		if (typeof j.orderId === "string" && j.orderId.trim()) {
			orderId = j.orderId.trim();
		}
	} catch {
		orderId = "";
	}

	if (!orderId) {
		return NextResponse.json({ success: false, error: "orderId 不能为空" }, { status: 400 });
	}

	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ success: false, error: "交易服务不可用" }, { status: 503 });
	}

	const result = await cancelLimitOrderService(srv, auth.userId, orderId);
	return NextResponse.json(result.body, { status: result.status });
}
