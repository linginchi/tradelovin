import { NextResponse, type NextRequest } from "next/server";

import { fetchEastmoneyKline, type KlinePeriod } from "@/lib/market/eastmoney-provider";
import type { ApiErrorResponse } from "@/lib/trade-v2/api-types";

export const runtime = "nodejs";

const ALLOWED_PERIODS = new Set<KlinePeriod>([1, 5, 15, 30, 60]);

function readPeriod(raw: string | null): KlinePeriod | null {
	const n = Number(raw);
	if (n === 1 || n === 5 || n === 15 || n === 30 || n === 60) return n;
	return null;
}

export async function GET(request: NextRequest) {
	const symbol = request.nextUrl.searchParams.get("symbol")?.trim();
	if (!symbol) {
		return NextResponse.json<ApiErrorResponse>({ success: false, error: "symbol 不能为空" }, { status: 400 });
	}

	const period = readPeriod(request.nextUrl.searchParams.get("period"));
	if (!period || !ALLOWED_PERIODS.has(period)) {
		return NextResponse.json<ApiErrorResponse>(
			{ success: false, error: "period 须为 1|5|15|30|60" },
			{ status: 400 },
		);
	}

	const limitRaw = request.nextUrl.searchParams.get("limit");
	const limit = limitRaw ? Math.min(500, Math.max(1, Number(limitRaw))) : 120;

	const result = await fetchEastmoneyKline(symbol, period, limit);
	if ("error" in result) {
		return NextResponse.json<ApiErrorResponse>({ success: false, error: result.error }, { status: 503 });
	}

	return NextResponse.json({
		success: true,
		data: {
			symbol: symbol.trim().toUpperCase(),
			period,
			source: "eastmoney",
			bars: result.bars,
		},
	});
}
