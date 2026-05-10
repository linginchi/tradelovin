import { NextResponse, type NextRequest } from "next/server";

import { requireMembershipCapability } from "@/lib/membership/guard";
import { getMarketQuote } from "@/lib/market/market-domain";
import { localizeNameBySymbol } from "@/lib/trade/get-current-price";
import { requireTradeUser } from "@/lib/trade/require-user";
import { getOrCreateSimAccount } from "@/lib/trade/sim-account";
import type {
	ApiErrorResponse,
	LegacyTradePosition,
	LegacyTradePositionsApiResponse,
} from "@/lib/trade-v2/api-types";

export const runtime = "nodejs";

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

	const locale = readLocale(request.nextUrl.searchParams.get("locale"));

	const { data: rows, error: qErr } = await supabase
		.from("sim_positions")
		.select("symbol,name,quantity,available_qty,frozen_qty,cost_price,market_value")
		.eq("account_id", account.id)
		.gt("quantity", 0)
		.order("symbol");

	if (qErr) {
		return NextResponse.json<ApiErrorResponse>({ success: false, error: qErr.message }, { status: 500 });
	}

	const data: LegacyTradePosition[] = await Promise.all(
		(rows ?? []).map(async (r: Record<string, unknown>) => {
			const cost = Number(r.cost_price ?? 0);
			const symbol = r.symbol as string;
			let quote: Awaited<ReturnType<typeof getMarketQuote>> = null;
			try {
				quote = await getMarketQuote(symbol, locale);
			} catch {
				quote = null;
			}
			const currentPrice = quote?.price ?? cost;
			const quantity = Number(r.quantity ?? 0);
			const fallbackName = localizeNameBySymbol(
				symbol,
				((r.name as string | null) ?? undefined) as string | undefined,
				locale,
			);
			return {
				symbol,
				name: (quote?.name as string | undefined) ?? fallbackName ?? null,
				quantity,
				available_qty: r.available_qty as number,
				frozen_qty: r.frozen_qty as number,
				cost_price: cost,
				market_value: Number((currentPrice * quantity).toFixed(2)),
				current_price: currentPrice,
			};
		}),
	);

	return NextResponse.json<LegacyTradePositionsApiResponse>({ success: true, data });
}
