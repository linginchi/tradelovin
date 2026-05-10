import { NextResponse } from "next/server";

import { requireMembershipCapability } from "@/lib/membership/guard";
import { getMarketQuote } from "@/lib/market/market-domain";
import { requireTradeUser } from "@/lib/trade/require-user";
import { getOrCreateTqProductAccount } from "@/lib/trade-v2/account";
import type { ApiErrorResponse, TradeV2AccountApiResponse, TradeV2AccountSummary } from "@/lib/trade-v2/api-types";

export const runtime = "nodejs";

export async function GET(request: Request) {
	const ctx = await requireTradeUser();
	if (ctx instanceof NextResponse) return ctx;

	const { supabase, userId } = ctx;
	const membership = await requireMembershipCapability(supabase, userId, "sim_trading");
	if (membership instanceof NextResponse) return membership;

	const url = new URL(request.url);
	const accountType = url.searchParams.get("accountType") === "credit" ? "credit" : "normal";
	const { data: account, error } = await getOrCreateTqProductAccount(supabase, userId, accountType);
	if (error || !account) {
		return NextResponse.json<ApiErrorResponse>({ success: false, error: error?.message ?? "读取账户失败" }, { status: 500 });
	}

	const { data: rows } = await supabase
		.from("tq_positions")
		.select("symbol,quantity")
		.eq("account_id", account.id)
		.eq("position_type", "long")
		.gt("quantity", 0);

	let marketValue = 0;
	for (const row of (rows ?? []) as Array<{ symbol: string; quantity: number }>) {
		try {
			const quote = await getMarketQuote(row.symbol);
			if (quote) marketValue += Number(row.quantity) * quote.price;
		} catch {
			// ignore quote failures for account summary
		}
	}
	const available = Number(account.available_balance);
	const frozen = Number(account.frozen_balance);

	const data: TradeV2AccountSummary = {
		id: account.id,
		account_name: account.account_name,
		account_type: account.account_type,
		available_balance: available,
		frozen_balance: frozen,
		total_assets: Math.round((available + frozen + marketValue) * 100) / 100,
	};
	return NextResponse.json<TradeV2AccountApiResponse>({
		success: true,
		data,
	});
}
