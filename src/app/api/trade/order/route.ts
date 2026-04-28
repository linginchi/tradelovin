import { NextResponse } from "next/server";

import { placeLimitOrderService } from "@/lib/trade/place-limit-order";
import { requireTradeUser } from "@/lib/trade/require-user";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = {
	symbol?: unknown;
	side?: unknown;
	price?: unknown;
	quantity?: unknown;
};

export async function POST(request: Request) {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) {
		return auth;
	}

	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return NextResponse.json({ success: false, error: "请求体不是合法 JSON" }, { status: 400 });
	}

	const symbolRaw = typeof body.symbol === "string" ? body.symbol.trim() : "";
	const sideRaw = typeof body.side === "string" ? body.side.trim().toLowerCase() : "";
	const price = typeof body.price === "number" ? body.price : Number(body.price);
	const quantity = typeof body.quantity === "number" ? body.quantity : Number(body.quantity);

	if (!symbolRaw) {
		return NextResponse.json({ success: false, error: "symbol 不能为空" }, { status: 400 });
	}
	if (sideRaw !== "buy" && sideRaw !== "sell") {
		return NextResponse.json({ success: false, error: "side 须为 buy 或 sell" }, { status: 400 });
	}
	if (!Number.isFinite(price) || price <= 0) {
		return NextResponse.json({ success: false, error: "price 须大于 0" }, { status: 400 });
	}
	if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
		return NextResponse.json({ success: false, error: "quantity 须为正整数" }, { status: 400 });
	}
	if (quantity % 100 !== 0) {
		return NextResponse.json({ success: false, error: "quantity 须为 100 的整数倍" }, { status: 400 });
	}

	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json(
			{ success: false, error: "交易服务不可用（缺少 SUPABASE_SERVICE_ROLE_KEY）" },
			{ status: 503 },
		);
	}

	const result = await placeLimitOrderService(srv, auth.userId, {
		symbolRaw,
		limitPrice: price,
		quantity,
		side: sideRaw as "buy" | "sell",
	});
	return NextResponse.json(result.body, { status: result.status });
}
