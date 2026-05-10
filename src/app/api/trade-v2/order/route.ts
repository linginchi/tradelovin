import { NextResponse } from "next/server";

import { requireMembershipCapability } from "@/lib/membership/guard";
import { isCanonicalCnSymbol, normalizeCnSymbol } from "@/lib/trade/symbol-normalizer";
import { requireTradeUser } from "@/lib/trade/require-user";
import { normalizeTradeApiError, SYMBOL_FORMAT_ERROR_MESSAGE } from "@/lib/trade-v2/api-error";
import type { TradeV2OrderApiResponse } from "@/lib/trade-v2/api-types";
import { placeV2Order } from "@/lib/trade-v2/order-service";

export const runtime = "nodejs";

type Body = {
	symbol?: unknown;
	side?: unknown;
	price?: unknown;
	quantity?: unknown;
	accountType?: unknown;
	positionMode?: unknown;
};

export async function POST(request: Request) {
	const ctx = await requireTradeUser();
	if (ctx instanceof NextResponse) return ctx;
	const { supabase, userId } = ctx;

	const membership = await requireMembershipCapability(supabase, userId, "sim_trading");
	if (membership instanceof NextResponse) return membership;

	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return NextResponse.json({ success: false, error: "请求体不是合法 JSON" }, { status: 400 });
	}

	const symbol = normalizeCnSymbol(typeof body.symbol === "string" ? body.symbol : "");
	const side = typeof body.side === "string" ? body.side.toLowerCase() : "";
	const price = typeof body.price === "number" ? body.price : Number(body.price);
	const quantity = typeof body.quantity === "number" ? body.quantity : Number(body.quantity);
	const accountType = body.accountType === "credit" ? "credit" : "normal";
	const positionMode = body.positionMode === "short" ? "short" : "long";
	if (!isCanonicalCnSymbol(symbol)) {
		return NextResponse.json({ success: false, error: SYMBOL_FORMAT_ERROR_MESSAGE }, { status: 400 });
	}
	if (side !== "buy" && side !== "sell") {
		return NextResponse.json({ success: false, error: "side 须为 buy 或 sell" }, { status: 400 });
	}

	try {
		const result = await placeV2Order(supabase, {
			userId,
			symbol,
			side,
			price,
			quantity,
			accountType,
			positionMode,
		});
		if (result.status >= 400) {
			const normalizedError = normalizeTradeApiError(
				"error" in result.body ? result.body.error ?? "下单失败" : "下单失败",
				"下单失败",
			);
			const errorResponse: TradeV2OrderApiResponse =
				"data" in result.body && result.body.data
					? { success: false, error: normalizedError, data: result.body.data }
					: { success: false, error: normalizedError };
			return NextResponse.json(
				errorResponse,
				{ status: result.status },
			);
		}
		return NextResponse.json<TradeV2OrderApiResponse>(result.body, { status: result.status });
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: normalizeTradeApiError(error, "下单失败") },
			{ status: 400 },
		);
	}
}
