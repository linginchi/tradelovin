import { NextResponse } from "next/server";

import { requireMembershipCapability } from "@/lib/membership/guard";
import { getMarketQuote } from "@/lib/market/market-domain";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function GET(request: Request) {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) return auth;

	const membership = await requireMembershipCapability(auth.supabase, auth.userId, "l2_market");
	if (membership instanceof NextResponse) return membership;

	const url = new URL(request.url);
	const symbol = String(url.searchParams.get("symbol") ?? "").trim();
	if (!symbol) {
		return NextResponse.json({ success: false, error: "symbol 不能为空" }, { status: 400 });
	}
	const quote = await getMarketQuote(symbol);
	if (!quote) {
		return NextResponse.json({ success: false, error: "行情不可用" }, { status: 404 });
	}
	return NextResponse.json({
		success: true,
		data: {
			symbol: quote.symbol,
			name: quote.name,
			price: quote.price,
			l2Depth: [],
			note: "L2 深度行情接口已预留，待接入供应商数据源",
		},
	});
}
