import { NextResponse } from "next/server";

import { requireMembershipCapability } from "@/lib/membership/guard";
import { requireTradeUser } from "@/lib/trade/require-user";
import { normalizeTradeApiError } from "@/lib/trade-v2/api-error";
import type {
	ApiErrorResponse,
	TradeV2ConditionCreateApiResponse,
	TradeV2ConditionsApiResponse,
} from "@/lib/trade-v2/api-types";
import { createCondition, listConditions } from "@/lib/trade-v2/watch-conditions";

export const runtime = "nodejs";

type Body = {
	symbol?: unknown;
	conditionType?: unknown;
	conditionPrice?: unknown;
	orderSide?: unknown;
	orderPrice?: unknown;
	orderQuantity?: unknown;
};

export async function GET() {
	const ctx = await requireTradeUser();
	if (ctx instanceof NextResponse) return ctx;

	const membership = await requireMembershipCapability(ctx.supabase, ctx.userId, "sim_trading");
	if (membership instanceof NextResponse) return membership;

	try {
		const data = await listConditions(ctx.supabase, ctx.userId);
		return NextResponse.json<TradeV2ConditionsApiResponse>({
			success: true,
			data,
		});
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "读取条件单失败" } satisfies ApiErrorResponse,
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

	try {
		const data = await createCondition(ctx.supabase, ctx.userId, {
			symbol: typeof body.symbol === "string" ? body.symbol : "",
			conditionType: (typeof body.conditionType === "string" ? body.conditionType : "price_>=") as
				| "price_>="
				| "price_<=",
			conditionPrice:
				typeof body.conditionPrice === "number" ? body.conditionPrice : Number(body.conditionPrice),
			orderSide: (typeof body.orderSide === "string" ? body.orderSide : "buy") as "buy" | "sell",
			orderPrice: typeof body.orderPrice === "number" ? body.orderPrice : Number(body.orderPrice),
			orderQuantity:
				typeof body.orderQuantity === "number" ? body.orderQuantity : Number(body.orderQuantity),
		});
		return NextResponse.json<TradeV2ConditionCreateApiResponse>({
			success: true,
			data,
		});
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: normalizeTradeApiError(error, "创建条件单失败") } satisfies ApiErrorResponse,
			{ status: 400 },
		);
	}
}
