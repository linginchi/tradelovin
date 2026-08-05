import {
	getBuiltinClosedSet,
	isBuiltinClosedDay,
	isWeekdayInMarket,
	type CnMarket,
} from "@/lib/market/cn-holidays";
import { fetchTradeCalendar } from "@/lib/market/tushare-provider";

export type TradeCalendarSource = "tushare" | "eastmoney" | "builtin" | "config";

export type TradeCalendarResolution = {
	isOpen: boolean;
	source: TradeCalendarSource;
	reason?: string;
};

const YMD_RE = /^\d{8}$/;

function normalizeYmd(ymd: string): string {
	const cleaned = ymd.replaceAll("-", "").trim();
	if (!YMD_RE.test(cleaned)) {
		throw new Error(`Invalid ymd: ${ymd}`);
	}
	return cleaned;
}

function readDateSet(raw: string | undefined): Set<string> {
	if (!raw) return new Set();
	return new Set(
		raw
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean)
			.map((s) => {
				try {
					return normalizeYmd(s);
				} catch {
					return "";
				}
			})
			.filter(Boolean),
	);
}

function getConfigSets(market: CnMarket): { closed: Set<string>; forcedOpen: Set<string> } {
	const suffix = market === "SSE" ? "SSE" : "XHKG";
	return {
		closed: readDateSet(process.env[`TRADE_CAL_CLOSED_DATES_${suffix}`]),
		forcedOpen: readDateSet(process.env[`TRADE_CAL_OPEN_DATES_${suffix}`]),
	};
}

function resolveByConfig(market: CnMarket, ymd: string): TradeCalendarResolution | null {
	const normalized = normalizeYmd(ymd);
	const { closed, forcedOpen } = getConfigSets(market);
	if (forcedOpen.has(normalized)) {
		return { isOpen: true, source: "config", reason: "TRADE_CAL_OPEN_DATES override" };
	}
	if (closed.has(normalized)) {
		return { isOpen: false, source: "config", reason: "TRADE_CAL_CLOSED_DATES override" };
	}
	return null;
}

/** 东方财富交易日历（非官方 reportName，失败则返回 null） */
async function fetchEastmoneyTradeDay(market: CnMarket, ymd: string): Promise<boolean | null> {
	const marketCode = market === "SSE" ? "CNSESH" : "CNHKSH";
	const filter = `(TRADE_DATE='${ymd}')(TRADE_MARKET="${marketCode}")`;
	const url = new URL("https://datacenter-web.eastmoney.com/api/data/v1/get");
	url.searchParams.set("reportName", "RPTA_SHARE_TRADE_DATE");
	url.searchParams.set("columns", "TRADE_DATE,IS_TRADE");
	url.searchParams.set("pageNumber", "1");
	url.searchParams.set("pageSize", "1");
	url.searchParams.set("sortColumns", "TRADE_DATE");
	url.searchParams.set("sortTypes", "-1");
	url.searchParams.set("source", "WEB");
	url.searchParams.set("client", "WEB");
	url.searchParams.set("filter", filter);

	try {
		const res = await fetch(url.toString(), {
			cache: "no-store",
			headers: { "User-Agent": "Mozilla/5.0 (compatible; tradelovin-calendar/1)" },
		});
		if (!res.ok) return null;
		const json = (await res.json()) as {
			success?: boolean;
			result?: { data?: Array<{ IS_TRADE?: string | number; is_trade?: string | number }> };
		};
		if (!json.success || !json.result?.data?.length) return null;
		const row = json.result.data[0];
		const flag = row.IS_TRADE ?? row.is_trade;
		if (flag == null) return null;
		return Number(flag) === 1 || String(flag) === "1";
	} catch {
		return null;
	}
}

function resolveBuiltin(market: CnMarket, ymd: string): TradeCalendarResolution {
	const normalized = normalizeYmd(ymd);
	const closed = getBuiltinClosedSet(market);
	const mergedClosed = new Set([...closed, ...getConfigSets(market).closed]);
	if (mergedClosed.has(normalized)) {
		return { isOpen: false, source: "builtin", reason: "holiday table" };
	}
	const weekdayOpen = isWeekdayInMarket(normalized, market);
	return {
		isOpen: weekdayOpen,
		source: "builtin",
		reason: weekdayOpen ? "weekday" : "weekend",
	};
}

export async function resolveCnTradeDay(market: CnMarket, ymd: string): Promise<TradeCalendarResolution> {
	const normalized = normalizeYmd(ymd);
	const fromConfig = resolveByConfig(market, normalized);
	if (fromConfig) return fromConfig;

	const tushareExchange = market === "SSE" ? "SSE" : "XHKG";
	const fromTushare = await fetchTradeCalendar(tushareExchange, normalized);
	if (fromTushare.value === true || fromTushare.value === false) {
		return { isOpen: fromTushare.value, source: "tushare" };
	}

	const fromEastmoney = await fetchEastmoneyTradeDay(market, normalized);
	if (fromEastmoney === true || fromEastmoney === false) {
		return { isOpen: fromEastmoney, source: "eastmoney" };
	}

	return resolveBuiltin(market, normalized);
}

export { isBuiltinClosedDay, normalizeYmd };
