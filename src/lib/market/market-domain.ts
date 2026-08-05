import { resolveCnTradeDay } from "@/lib/market/cn-calendar-provider";
import { marketYmd } from "@/lib/market/cn-holidays";
import { fetchEastmoneyQuote } from "@/lib/market/eastmoney-provider";
import { fetchLatestDaily } from "@/lib/market/tushare-provider";
import { fetchTencentQuote } from "@/lib/market/tencent-provider";
import { detectInstrumentType } from "@/lib/trade/instrument-rules";
import { getCurrentPrice } from "@/lib/trade/get-current-price";

export type MarketDataSource = "tushare" | "sina" | "tencent" | "eastmoney";

export type MarketQuote = {
	symbol: string;
	name?: string;
	price: number;
	instrument: "stock" | "etf" | "cbond";
	/** 最终命中的行情源 */
	source: MarketDataSource;
	/** 尝试链路（含失败源，直至成功源） */
	dataSources: MarketDataSource[];
	isTradeDay: boolean | null;
	isTradeDaySource: string;
};

function toTsCode(raw: string): string | null {
	const digits = raw.replace(/\D/g, "");
	if (digits.length !== 6) return null;
	if (digits.startsWith("6") || digits.startsWith("9")) return `${digits}.SH`;
	return `${digits}.SZ`;
}

type QuoteCandidate = {
	source: MarketDataSource;
	price: number;
	name?: string;
	displaySymbol: string;
};

async function tryQuoteChain(symbolRaw: string, locale: string): Promise<{
	candidate: QuoteCandidate | null;
	dataSources: MarketDataSource[];
}> {
	const dataSources: MarketDataSource[] = [];
	const tsCode = toTsCode(symbolRaw);

	if (tsCode) {
		dataSources.push("tushare");
		const daily = await fetchLatestDaily(tsCode);
		if (daily.value && daily.value > 0) {
			return {
				candidate: {
					source: "tushare",
					price: daily.value,
					displaySymbol: symbolRaw.trim().toUpperCase(),
				},
				dataSources,
			};
		}
	}

	dataSources.push("sina");
	const sina = await getCurrentPrice(symbolRaw, locale);
	if (sina) {
		return {
			candidate: {
				source: "sina",
				price: sina.price,
				name: sina.name,
				displaySymbol: sina.displaySymbol,
			},
			dataSources,
		};
	}

	dataSources.push("tencent");
	const tencent = await fetchTencentQuote(symbolRaw, locale);
	if (tencent) {
		return {
			candidate: {
				source: "tencent",
				price: tencent.price,
				name: tencent.name,
				displaySymbol: tencent.displaySymbol,
			},
			dataSources,
		};
	}

	dataSources.push("eastmoney");
	const eastmoney = await fetchEastmoneyQuote(symbolRaw);
	if (eastmoney) {
		return {
			candidate: {
				source: "eastmoney",
				price: eastmoney.price,
				name: eastmoney.name,
				displaySymbol: eastmoney.displaySymbol,
			},
			dataSources,
		};
	}

	return { candidate: null, dataSources };
}

export async function getMarketQuote(symbolRaw: string, locale = "zh"): Promise<MarketQuote | null> {
	const instrument = detectInstrumentType(symbolRaw);
	const ymd = marketYmd("SSE");

	const [calendar, quoteChain] = await Promise.all([
		resolveCnTradeDay("SSE", ymd),
		tryQuoteChain(symbolRaw, locale),
	]);

	if (!quoteChain.candidate) return null;

	return {
		symbol: quoteChain.candidate.displaySymbol,
		name: quoteChain.candidate.name,
		price: quoteChain.candidate.price,
		instrument,
		source: quoteChain.candidate.source,
		dataSources: quoteChain.dataSources,
		isTradeDay: calendar.isOpen,
		isTradeDaySource: calendar.source,
	};
}
