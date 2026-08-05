import { NextResponse, type NextRequest } from "next/server";

import { getMarketQuote, type MarketDataSource } from "@/lib/market/market-domain";
import { getInstrumentRule } from "@/lib/trade/instrument-rules";
import type { ApiErrorResponse, TradeV2QuoteApiResponse, TradeV2QuoteData } from "@/lib/trade-v2/api-types";

export const runtime = "nodejs";

type L1DepthLevel = {
	level: number;
	price: number;
	volume: number;
};

type L1Print = {
	price: number;
	quantity: number;
	side: "buy" | "sell";
	trade_time: string;
};

type QuoteResponseData = Omit<TradeV2QuoteData, "source"> & {
	isTradeDay: boolean | null;
	isTradeDaySource: string;
	dataSources: MarketDataSource[];
	source: MarketDataSource;
};

function readLocale(v: string | null): "zh" | "zh-TW" | "en" {
	if (v === "en" || v === "zh-TW") return v;
	return "zh";
}

function inferTickByInstrument(instrument: "stock" | "etf" | "cbond"): number {
	if (instrument === "cbond") return 0.001;
	if (instrument === "etf") return 0.001;
	return 0.01;
}

function roundToTick(price: number, tick: number): number {
	if (!Number.isFinite(price) || tick <= 0) return price;
	return Math.max(tick, Math.round(price / tick) * tick);
}

function symbolSeed(symbol: string): number {
	return symbol.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
}

function buildL1Depth(price: number, tick: number, seed: number): { asks: L1DepthLevel[]; bids: L1DepthLevel[] } {
	const asks: L1DepthLevel[] = [];
	const bids: L1DepthLevel[] = [];
	for (let i = 1; i <= 5; i += 1) {
		const volBase = 600 + ((seed + i * 137) % 1400);
		asks.push({
			level: i,
			price: roundToTick(price + tick * i, tick),
			volume: volBase * 100,
		});
		bids.push({
			level: i,
			price: roundToTick(Math.max(tick, price - tick * i), tick),
			volume: (volBase + 200) * 100,
		});
	}
	return { asks, bids };
}

function buildL1Prints(price: number, tick: number, seed: number): L1Print[] {
	const now = Date.now();
	const prints: L1Print[] = [];
	for (let i = 0; i < 8; i += 1) {
		const direction = (seed + i) % 2 === 0 ? 1 : -1;
		const qty = (((seed + i * 53) % 15) + 1) * 100;
		prints.push({
			price: roundToTick(Math.max(tick, price + direction * tick * ((i % 3) + 1)), tick),
			quantity: qty,
			side: direction > 0 ? "buy" : "sell",
			trade_time: new Date(now - i * 5000).toISOString(),
		});
	}
	return prints;
}

export async function GET(request: NextRequest) {
	const symbol = request.nextUrl.searchParams.get("symbol")?.trim();
	if (!symbol) {
		return NextResponse.json<ApiErrorResponse>({ success: false, error: "symbol 不能为空" }, { status: 400 });
	}
	const locale = readLocale(request.nextUrl.searchParams.get("locale"));
	// mode 参数保留兼容；行情链路由服务端按 tushare→新浪→腾讯→东财 自动兜底
	void request.nextUrl.searchParams.get("mode");

	const quote = await getMarketQuote(symbol, locale);
	if (!quote) {
		return NextResponse.json<ApiErrorResponse>({ success: false, error: "暂时无法获取行情" }, { status: 503 });
	}
	const rule = getInstrumentRule(symbol);
	const tick = inferTickByInstrument(rule.instrument);
	const seeded = symbolSeed(quote.symbol);
	const l1 = buildL1Depth(quote.price, tick, seeded);
	const prints = buildL1Prints(quote.price, tick, seeded);

	const data: QuoteResponseData = {
		symbol: quote.symbol,
		name: quote.name,
		price: quote.price,
		instrument: quote.instrument,
		source: quote.source,
		dataSources: quote.dataSources,
		isTradeDay: quote.isTradeDay,
		isTradeDaySource: quote.isTradeDaySource,
		lot_size: rule.lotSize,
		limit_band_ratio: rule.limitBandRatio,
		market_mode: "l1",
		order_book: l1,
		recent_trades: prints,
		snapshot_time: new Date().toISOString(),
	};
	return NextResponse.json({
		success: true,
		data,
	} as TradeV2QuoteApiResponse);
}
