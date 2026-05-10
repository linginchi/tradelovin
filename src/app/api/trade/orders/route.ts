import { NextResponse, type NextRequest } from "next/server";

import { requireMembershipCapability } from "@/lib/membership/guard";
import { getMarketQuote } from "@/lib/market/market-domain";
import { localizeNameBySymbol } from "@/lib/trade/get-current-price";
import { getChinaTodayRangeIso } from "@/lib/trade/cn-calendar";
import { requireTradeUser } from "@/lib/trade/require-user";
import { getOrCreateSimAccount } from "@/lib/trade/sim-account";
import type {
	ApiErrorResponse,
	LegacyTradeOrder,
	LegacyTradeOrderStatus,
	LegacyTradeOrdersApiResponse,
} from "@/lib/trade-v2/api-types";

export const runtime = "nodejs";

const ORDER_STATUSES = new Set(["pending", "partial", "filled", "cancelled", "rejected"]);

function toLegacyOrderStatus(value: unknown): LegacyTradeOrderStatus {
	const status = String(value ?? "");
	if (ORDER_STATUSES.has(status)) return status as LegacyTradeOrderStatus;
	return "pending";
}

function readLocale(v: string | null): "zh" | "zh-TW" | "en" {
	if (v === "en" || v === "zh-TW") return v;
	return "zh";
}

export async function GET(request: NextRequest) {
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
		return NextResponse.json<ApiErrorResponse>(
			{ success: false, error: accErr?.message ?? "读取账户失败" },
			{ status: 500 },
		);
	}

	const { start, end } = getChinaTodayRangeIso();
	const statusParam = request.nextUrl.searchParams.get("status");
	const locale = readLocale(request.nextUrl.searchParams.get("locale"));

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
		return NextResponse.json<ApiErrorResponse>({ success: false, error: qErr.message }, { status: 500 });
	}

	const rowsSafe = (rows ?? []) as Array<Record<string, unknown>>;
	const symbols = [...new Set(rowsSafe.map((r) => String(r.symbol ?? "")).filter(Boolean))];

	const { data: posRows } = await supabase
		.from("sim_positions")
		.select("symbol,name")
		.eq("account_id", account.id);
	const nameFromDb = new Map<string, string>();
	for (const row of (posRows ?? []) as Array<{ symbol: string; name: string | null }>) {
		if (!row?.symbol || !row?.name) continue;
		const localized = localizeNameBySymbol(row.symbol, row.name, locale);
		if (localized) nameFromDb.set(row.symbol, localized);
	}
	const nameFromApi = new Map<string, string>();
	await Promise.all(
		symbols.map(async (symbol) => {
			const quote = await getMarketQuote(symbol, locale);
			if (quote?.name) nameFromApi.set(symbol, quote.name);
		}),
	);

	const data: LegacyTradeOrder[] = (rows ?? []).map((r: Record<string, unknown>) => ({
		id: String(r.id ?? ""),
		symbol: String(r.symbol ?? ""),
		name: nameFromApi.get(String(r.symbol ?? "")) ?? nameFromDb.get(String(r.symbol ?? "")) ?? null,
		side: String(r.side ?? ""),
		price: Number(r.price),
		quantity: Number(r.quantity ?? 0),
		filled_qty: Number(r.filled_qty ?? 0),
		status: toLegacyOrderStatus(r.status),
		created_at: String(r.created_at ?? ""),
	}));

	return NextResponse.json<LegacyTradeOrdersApiResponse>({ success: true, data });
}
