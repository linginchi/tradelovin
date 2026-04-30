import { NextResponse, type NextRequest } from "next/server";

import { getMarketQuote } from "@/lib/market/market-domain";
import { getInstrumentRule } from "@/lib/trade/instrument-rules";

export const runtime = "nodejs";

function readLocale(v: string | null): "zh" | "zh-TW" | "en" {
	if (v === "en" || v === "zh-TW") return v;
	return "zh";
}

export async function GET(request: NextRequest) {
	const symbol = request.nextUrl.searchParams.get("symbol")?.trim();
	if (!symbol) {
		return NextResponse.json({ success: false, error: "symbol 不能为空" }, { status: 400 });
	}
	const locale = readLocale(request.nextUrl.searchParams.get("locale"));

	const quote = await getMarketQuote(symbol, locale);
	if (!quote) {
		return NextResponse.json({ success: false, error: "暂时无法获取行情" }, { status: 503 });
	}
	const rule = getInstrumentRule(symbol);
	return NextResponse.json({
		success: true,
		data: {
			...quote,
			lot_size: rule.lotSize,
			limit_band_ratio: rule.limitBandRatio,
		},
	});
}
