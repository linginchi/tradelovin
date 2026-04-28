import { NextResponse } from "next/server";

import { requireTradeUser } from "@/lib/trade/require-user";
import { getOrCreateSimAccount } from "@/lib/trade/sim-account";

export const runtime = "nodejs";

export async function GET() {
	const ctx = await requireTradeUser();
	if (ctx instanceof NextResponse) {
		return ctx;
	}

	const { supabase, userId } = ctx;

	const { data: account, error: accErr } = await getOrCreateSimAccount(supabase, userId);
	if (accErr || !account) {
		return NextResponse.json({ success: false, error: accErr?.message ?? "读取账户失败" }, { status: 500 });
	}

	const { data: rows, error: qErr } = await supabase
		.from("sim_positions")
		.select("symbol,name,quantity,available_qty,frozen_qty,cost_price,market_value")
		.eq("account_id", account.id)
		.gt("quantity", 0)
		.order("symbol");

	if (qErr) {
		return NextResponse.json({ success: false, error: qErr.message }, { status: 500 });
	}

	const data = (rows ?? []).map((r: Record<string, unknown>) => {
		const cost = Number(r.cost_price ?? 0);
		return {
			symbol: r.symbol as string,
			name: (r.name ?? null) as string | null,
			quantity: r.quantity as number,
			available_qty: r.available_qty as number,
			frozen_qty: r.frozen_qty as number,
			cost_price: cost,
			market_value: Number(r.market_value ?? 0),
			current_price: cost,
		};
	});

	return NextResponse.json({ success: true, data });
}
