import { resolveCnTradeDay, normalizeYmd } from "@/lib/market/cn-calendar-provider";

type Market = "SSE" | "XHKG";

export async function isMarketTradingDay(market: Market, ymd: string): Promise<boolean> {
	const normalized = normalizeYmd(ymd);
	const resolved = await resolveCnTradeDay(market, normalized);
	return resolved.isOpen;
}

export async function isJointTradingDay(ymd: string): Promise<{ sseOpen: boolean; xhkgOpen: boolean }> {
	const normalized = normalizeYmd(ymd);
	const [sse, xhkg] = await Promise.all([
		resolveCnTradeDay("SSE", normalized),
		resolveCnTradeDay("XHKG", normalized),
	]);
	return { sseOpen: sse.isOpen, xhkgOpen: xhkg.isOpen };
}
