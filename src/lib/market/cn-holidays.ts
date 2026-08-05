export type CnMarket = "SSE" | "XHKG";

/**
 * 2026 沪深交易所休市日（YYYYMMDD）。
 * 来源：https://www.sse.com.cn/disclosure/announcement/general/c/c_20251222_10802507.shtml
 * 国务院调休上班日不改变证券交易所的周末休市规则。
 */
export const BUILTIN_CLOSED_DATES_SSE = new Set<string>([
	"20260101",
	"20260102",
	"20260103",
	"20260215",
	"20260216",
	"20260217",
	"20260218",
	"20260219",
	"20260220",
	"20260221",
	"20260222",
	"20260223",
	"20260404",
	"20260405",
	"20260406",
	"20260501",
	"20260502",
	"20260503",
	"20260504",
	"20260505",
	"20260619",
	"20260620",
	"20260621",
	"20260925",
	"20260926",
	"20260927",
	"20261001",
	"20261002",
	"20261003",
	"20261004",
	"20261005",
	"20261006",
	"20261007",
]);

/**
 * 2026 港交所证券市场休市日（YYYYMMDD）。
 * 来源：https://www.hkex.com.hk/-/media/HKEX-Market/Services/Circulars-and-Notices/Participant-and-Members-Circulars/SEHK/2025/ce_SEHK_CT_075_2025.pdf
 * 2/16、12/24、12/31 为半日交易，故不纳入休市表。
 */
export const BUILTIN_CLOSED_DATES_XHKG = new Set<string>([
	"20260101",
	"20260217",
	"20260218",
	"20260219",
	"20260403",
	"20260406",
	"20260407",
	"20260501",
	"20260525",
	"20260619",
	"20260701",
	"20261001",
	"20261019",
	"20261225",
	"20261226",
]);

export function getBuiltinClosedSet(market: CnMarket): Set<string> {
	return market === "SSE" ? BUILTIN_CLOSED_DATES_SSE : BUILTIN_CLOSED_DATES_XHKG;
}

export function marketTimeZone(market: CnMarket): string {
	return market === "SSE" ? "Asia/Shanghai" : "Asia/Hong_Kong";
}

export function marketYmd(market: CnMarket, date = new Date()): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: marketTimeZone(market),
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);
	const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
	return `${value("year")}${value("month")}${value("day")}`;
}

export function isWeekdayInMarket(ymd: string, market: CnMarket): boolean {
	const y = ymd.slice(0, 4);
	const m = ymd.slice(4, 6);
	const d = ymd.slice(6, 8);
	const date = new Date(`${y}-${m}-${d}T12:00:00Z`);
	const weekday = new Intl.DateTimeFormat("en-US", {
		timeZone: marketTimeZone(market),
		weekday: "short",
	}).format(date);
	return weekday !== "Sat" && weekday !== "Sun";
}

export function isBuiltinClosedDay(market: CnMarket, ymd: string): boolean {
	return getBuiltinClosedSet(market).has(ymd);
}
