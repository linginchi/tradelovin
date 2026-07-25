import {

	fetchDaily20d,

	fetchDailyBasic,

	fetchLatestDaily,

	fetchRtDaily,

	fetchTradeCalendar,

} from "@/lib/market/tushare-provider";

import { detectInstrumentType } from "@/lib/trade/instrument-rules";

import { getCurrentPrice, getSinaQuoteDetail, type SinaDepthLevel } from "@/lib/trade/get-current-price";



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



function normalizeSymbol(raw: string): string {

	return raw.trim().toUpperCase();

}



/**

 * 并行拉取新浪 L1 + Tushare（rt_k 盘中 / daily 兜底），任一成功即返回。

 * 优先级：新浪（实时）> Tushare rt_k > Tushare 最近日线收盘价。

 */

export async function getMarketQuote(symbolRaw: string, locale = "zh"): Promise<MarketQuote | null> {

	const instrument = detectInstrumentType(symbolRaw);

	const tsCode = toTsCode(symbolRaw);

	const symbol = normalizeSymbol(symbolRaw);



	const [isTradeDay, sinaQuote, tushareRt, tushareDaily] = await Promise.all([

		fetchTradeCalendar("SSE"),

		getCurrentPrice(symbolRaw, locale).catch(() => null),

		tsCode ? fetchRtDaily(tsCode).catch(() => null) : Promise.resolve(null),

		tsCode ? fetchLatestDaily(tsCode).catch(() => null) : Promise.resolve(null),

	]);



	if (sinaQuote) {

		return {

			symbol: sinaQuote.displaySymbol,

			name: sinaQuote.name,

			price: sinaQuote.price,

			instrument,

			source: "sina",

			isTradeDay,

		};

	}



	if (tushareRt && tushareRt > 0) {

		return {

			symbol,

			price: tushareRt,

			instrument,

			source: "tushare",

			isTradeDay,

		};

	}



	if (tushareDaily && tushareDaily > 0) {

		return {

			symbol,

			price: tushareDaily,

			instrument,

			source: "tushare",

			isTradeDay,

		};

	}



	console.warn("[quote] all sources failed", { symbol: symbolRaw, tsCode });

	return null;

}



export type MarketQuoteExtended = MarketQuote & {

	prevClose?: number;

	open?: number;

	high?: number;

	low?: number;

	change?: number;

	changePct?: number;

	/** 成交量（股） */

	volume?: number;

	/** 成交额（元） */

	amount?: number;

	/** 总市值（万元） */

	totalMv?: number;

	/** 流通市值（万元） */

	circMv?: number;

	peTtm?: number;

	pb?: number;

	/** 换手率（%） */

	turnoverRate?: number;

	/** 近 20 交易日均价 */

	avgPrice20d?: number;

	/** 近 20 交易日平均成交额（元） */

	avgAmount20d?: number;

	/** A 股新浪真实五档 */

	realDepth?: {

		asks: SinaDepthLevel[];

		bids: SinaDepthLevel[];

	};

};



/**

 * 扩展行情：以 getMarketQuote 为权威价（与撮合/账户一致），

 * 叠加新浪明细（OHLC/量额/五档）与 Tushare 基本面（仅 A 股），任一增强源失败均降级隐藏。

 */

export async function getMarketQuoteExtended(symbolRaw: string, locale = "zh"): Promise<MarketQuoteExtended | null> {

	const tsCode = toTsCode(symbolRaw);



	const [base, detail, dailyBasic, daily20d] = await Promise.all([

		getMarketQuote(symbolRaw, locale),

		getSinaQuoteDetail(symbolRaw, locale).catch(() => null),

		tsCode ? fetchDailyBasic(tsCode).catch(() => null) : Promise.resolve(null),

		tsCode ? fetchDaily20d(tsCode).catch(() => null) : Promise.resolve(null),

	]);

	if (!base) return null;



	const prevClose = detail?.prevClose;

	const change = prevClose != null ? base.price - prevClose : undefined;

	const changePct = prevClose != null && change != null ? (change / prevClose) * 100 : undefined;



	return {

		...base,

		name: base.name ?? detail?.name,

		prevClose,

		open: detail?.open,

		high: detail?.high,

		low: detail?.low,

		change,

		changePct,

		volume: detail?.volume,

		amount: detail?.amount,

		totalMv: dailyBasic?.totalMv,

		circMv: dailyBasic?.circMv,

		peTtm: dailyBasic?.peTtm,

		pb: dailyBasic?.pb,

		turnoverRate: dailyBasic?.turnoverRate,

		avgPrice20d: daily20d?.avgPrice20d,

		avgAmount20d: daily20d?.avgAmount20d,

		realDepth: detail?.depth,

	};

}
