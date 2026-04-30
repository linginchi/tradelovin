import { fetchTradeCalendar } from "@/lib/market/tushare-provider";

type Market = "SSE" | "XHKG";

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

function getConfigSets(market: Market): { closed: Set<string>; forcedOpen: Set<string> } {
	const suffix = market === "SSE" ? "SSE" : "XHKG";
	return {
		closed: readDateSet(process.env[`TRADE_CAL_CLOSED_DATES_${suffix}`]),
		forcedOpen: readDateSet(process.env[`TRADE_CAL_OPEN_DATES_${suffix}`]),
	};
}

function isWeekdayInHongKong(ymd: string): boolean {
	const date = new Date(`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T00:00:00+08:00`);
	const day = date.getUTCDay();
	return day >= 1 && day <= 5;
}

function isOpenByConfig(market: Market, ymd: string): boolean {
	const normalized = normalizeYmd(ymd);
	const { closed, forcedOpen } = getConfigSets(market);
	if (forcedOpen.has(normalized)) return true;
	if (closed.has(normalized)) return false;
	return isWeekdayInHongKong(normalized);
}

export async function isMarketTradingDay(market: Market, ymd: string): Promise<boolean> {
	const normalized = normalizeYmd(ymd);
	const fromApi = await fetchTradeCalendar(market, normalized);
	if (fromApi === true || fromApi === false) return fromApi;
	return isOpenByConfig(market, normalized);
}

export async function isJointTradingDay(ymd: string): Promise<{ sseOpen: boolean; xhkgOpen: boolean }> {
	const [sseOpen, xhkgOpen] = await Promise.all([
		isMarketTradingDay("SSE", ymd),
		isMarketTradingDay("XHKG", ymd),
	]);
	return { sseOpen, xhkgOpen };
}
