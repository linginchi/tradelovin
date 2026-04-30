import { fetchLatestDaily, fetchTradeCalendar } from "@/lib/market/tushare-provider";
import { detectInstrumentType } from "@/lib/trade/instrument-rules";
import { getCurrentPrice } from "@/lib/trade/get-current-price";

export type MarketQuote = {
	symbol: string;
	name?: string;
	price: number;
	instrument: "stock" | "etf" | "cbond";
	source: "tushare" | "sina";
	isTradeDay: boolean | null;
};

function toTsCode(raw: string): string | null {
	const digits = raw.replace(/\D/g, "");
	if (digits.length !== 6) return null;
	if (digits.startsWith("6") || digits.startsWith("9")) return `${digits}.SH`;
	return `${digits}.SZ`;
}

export async function getMarketQuote(symbolRaw: string, locale = "zh"): Promise<MarketQuote | null> {
	const instrument = detectInstrumentType(symbolRaw);
	const tsCode = toTsCode(symbolRaw);
	const isTradeDay = await fetchTradeCalendar("SSE");

	if (tsCode) {
		const close = await fetchLatestDaily(tsCode);
		if (close && close > 0) {
			return {
				symbol: symbolRaw.trim().toUpperCase(),
				price: close,
				instrument,
				source: "tushare",
				isTradeDay,
			};
		}
	}

	const fallback = await getCurrentPrice(symbolRaw, locale);
	if (!fallback) return null;
	return {
		symbol: fallback.displaySymbol,
		name: fallback.name,
		price: fallback.price,
		instrument,
		source: "sina",
		isTradeDay,
	};
}
