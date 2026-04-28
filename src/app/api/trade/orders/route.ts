import { NextResponse, type NextRequest } from "next/server";

import { getHongKongTodayRangeIso } from "@/lib/trade/hk-calendar";
import { requireTradeUser } from "@/lib/trade/require-user";
import { getOrCreateSimAccount } from "@/lib/trade/sim-account";

export const runtime = "nodejs";

const ORDER_STATUSES = new Set(["pending", "partial", "filled", "cancelled", "rejected"]);

export async function GET(request: NextRequest) {
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
	const statusParam = request.nextUrl.searchParams.get("status");

	let q = supabase
		.from("sim_orders")
		.select("id,symbol,side,price,quantity,filled_qty,status,created_at")
		.eq("account_id", account.id)
		.gte("created_at", start)
		.lt("created_at", end)
		.order("created_at", { ascending: false });

	if (statusParam && statusParam !== "all" && ORDER_STATUSES.has(statusParam)) {
		q = q.eq("status", statusParam);
	}

	const { data: rows, error: qErr } = await q;

	if (qErr) {
		return NextResponse.json({ success: false, error: qErr.message }, { status: 500 });
	}

	const data = (rows ?? []).map((r: Record<string, unknown>) => ({
		id: r.id,
		symbol: r.symbol,
		side: r.side,
		price: Number(r.price),
		quantity: r.quantity,
		filled_qty: r.filled_qty,
		status: r.status,
		created_at: r.created_at,
	}));

	return NextResponse.json({ success: true, data });
}
