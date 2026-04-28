import { NextResponse } from "next/server";

import { getHongKongTodayRangeIso } from "@/lib/trade/hk-calendar";
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

	const { start, end } = getHongKongTodayRangeIso();

	const { data: rows, error: qErr } = await supabase
		.from("sim_trades")
		.select("id,order_id,symbol,side,price,quantity,commission,stamp_tax,trade_time")
		.eq("account_id", account.id)
		.gte("trade_time", start)
		.lt("trade_time", end)
		.order("trade_time", { ascending: false });

	if (qErr) {
		return NextResponse.json({ success: false, error: qErr.message }, { status: 500 });
	}

	const data = (rows ?? []).map((r: Record<string, unknown>) => ({
		id: r.id,
		order_id: r.order_id,
		symbol: r.symbol,
		side: r.side,
		price: Number(r.price),
		quantity: r.quantity,
		commission: Number(r.commission),
		stamp_tax: Number(r.stamp_tax),
		trade_time: r.trade_time,
	}));

	return NextResponse.json({ success: true, data });
}
