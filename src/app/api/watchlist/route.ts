import { NextResponse } from "next/server";

import { requireMembershipCapability } from "@/lib/membership/guard";
import { requireTradeUser } from "@/lib/trade/require-user";
import { normalizeTradeApiError } from "@/lib/trade-v2/api-error";
import type {
	ApiErrorResponse,
	TradeV2WatchlistApiResponse,
	TradeV2WatchlistCreateApiResponse,
} from "@/lib/trade-v2/api-types";
import { createWatchlist, listWatchlist } from "@/lib/trade-v2/watch-conditions";

export const runtime = "nodejs";

type Body = {
	symbol?: unknown;
	alertPrice?: unknown;
	alertType?: unknown;
};

export async function GET() {
	const ctx = await requireTradeUser();
	if (ctx instanceof NextResponse) return ctx;

	const membership = await requireMembershipCapability(ctx.supabase, ctx.userId, "sim_trading");
	if (membership instanceof NextResponse) return membership;

	try {
		const data = await listWatchlist(ctx.supabase, ctx.userId);
		return NextResponse.json<TradeV2WatchlistApiResponse>({
			success: true,
			data,
		});
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "读取监控失败" } satisfies ApiErrorResponse,
			{ status: 500 },
		);
	}
}

export async function POST(request: Request) {
	const ctx = await requireTradeUser();
	if (ctx instanceof NextResponse) return ctx;

	const membership = await requireMembershipCapability(ctx.supabase, ctx.userId, "sim_trading");
	if (membership instanceof NextResponse) return membership;

	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return NextResponse.json<ApiErrorResponse>({ success: false, error: "请求体不是合法 JSON" }, { status: 400 });
	}
	const symbol = typeof body.symbol === "string" ? body.symbol : "";
	const alertPrice = typeof body.alertPrice === "number" ? body.alertPrice : Number(body.alertPrice);
	const alertType = typeof body.alertType === "string" ? body.alertType : "price_above";

	try {
		const data = await createWatchlist(ctx.supabase, ctx.userId, {
			symbol,
			alertPrice,
			alertType: alertType as "price_above" | "price_below" | "percent_up" | "percent_down",
		});
		return NextResponse.json<TradeV2WatchlistCreateApiResponse>({
			success: true,
			data,
		});
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: normalizeTradeApiError(error, "创建监控失败") } satisfies ApiErrorResponse,
			{ status: 400 },
		);
	}
}
