import { NextResponse } from "next/server";

import { requireMembershipCapability } from "@/lib/membership/guard";
import { getMarketQuote } from "@/lib/market/market-domain";
import { requireTradeUser } from "@/lib/trade/require-user";
import { getOrCreateSimAccount } from "@/lib/trade/sim-account";

export const runtime = "nodejs";

export async function GET() {
	const ctx = await requireTradeUser();
	if (ctx instanceof NextResponse) {
		return ctx;
	}

	const { supabase, userId } = ctx;
	const membership = await requireMembershipCapability(supabase, userId, "sim_trading");
	if (membership instanceof NextResponse) {
		return membership;
	}

	const { data: account, error: accErr } = await getOrCreateSimAccount(supabase, userId);
	if (accErr || !account) {
		return NextResponse.json({ success: false, error: accErr?.message ?? "读取账户失败" }, { status: 500 });
	}

	const { data: positions } = await supabase
		.from("sim_positions")
		.select("symbol,quantity,market_value")
		.eq("account_id", account.id);

	let positionsMarketValue = 0;
	for (const row of positions ?? []) {
		const item = row as { symbol?: string | null; quantity?: number | null; market_value?: string | number | null };
		const symbol = item.symbol ?? "";
		const quantity = Number(item.quantity ?? 0);
		let quote: Awaited<ReturnType<typeof getMarketQuote>> = null;
		if (symbol) {
			try {
				quote = await getMarketQuote(symbol);
			} catch {
				quote = null;
			}
		}
		const mv = quote ? quote.price * quantity : Number(item.market_value ?? 0);
		if (!Number.isNaN(mv)) positionsMarketValue += mv;
	}

	const currentBalance = Number(account.current_balance);
	const frozenBalance = Number(account.frozen_balance);
	const totalAssets = currentBalance + frozenBalance + positionsMarketValue;

	return NextResponse.json({
		success: true,
		data: {
			id: account.id,
			account_name: account.account_name,
			current_balance: currentBalance,
			frozen_balance: frozenBalance,
			total_assets: Math.round(totalAssets * 100) / 100,
		},
	});
}
