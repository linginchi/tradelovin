import { mapUserSymbolToSina } from "@/lib/trade/symbol-mapping";

export type MarketQuotePayload = {
	price: number;
	name?: string;
	displaySymbol: string;
};

export type KlinePeriod = 1 | 5 | 15 | 30 | 60;

export type KlineBar = {
	time: string;
	open: number;
	close: number;
	high: number;
	low: number;
	volume: number;
	amount: number;
};

const PERIOD_TO_KLT: Record<KlinePeriod, number> = {
	1: 1,
	5: 5,
	15: 15,
	30: 30,
	60: 60,
};

export function toEastmoneySecId(rawSymbol: string): string | null {
	const mapped = mapUserSymbolToSina(rawSymbol);
	if (!mapped) return null;
	if (mapped.sinaListKey.startsWith("hk")) {
		const code = mapped.sinaListKey.slice(2).padStart(5, "0");
		return `116.${code}`;
	}
	const digits = mapped.displaySymbol.replace(/\D/g, "");
	if (digits.length !== 6) return null;
	const market = mapped.sinaListKey.startsWith("sh") ? "1" : "0";
	return `${market}.${digits}`;
}

function parseRealtimeJson(json: {
	data?: { f43?: number; f57?: number; f58?: string; f60?: number };
}): MarketQuotePayload | null {
	const data = json.data;
	if (!data) return null;
	const rawPrice = data.f43 ?? data.f60;
	if (rawPrice == null || !Number.isFinite(rawPrice)) return null;
	const price = Math.round((Number(rawPrice) / 100) * 10000) / 10000;
	if (price <= 0) return null;
	const code = data.f57 != null ? String(data.f57).padStart(6, "0") : undefined;
	return {
		price,
		name: data.f58?.length ? data.f58 : undefined,
		displaySymbol: code ?? "",
	};
}

/** 东方财富 push2 实时价；失败返回 null */
export async function fetchEastmoneyQuote(rawSymbol: string): Promise<MarketQuotePayload | null> {
	const secid = toEastmoneySecId(rawSymbol);
	if (!secid) return null;

	const urls = [
		`https://push2.eastmoney.com/api/qt/stock/get?invt=2&fltt=1&fields=f43,f57,f58,f60&secid=${encodeURIComponent(secid)}`,
		`https://77.push2.eastmoney.com/api/qt/stock/get?invt=2&fltt=1&fields=f43,f57,f58,f60&secid=${encodeURIComponent(secid)}`,
	];

	for (const url of urls) {
		try {
			const res = await fetch(url, {
				cache: "no-store",
				headers: {
					Referer: "https://quote.eastmoney.com/",
					"User-Agent": "Mozilla/5.0 (compatible; tradelovin-quote/1)",
				},
			});
			if (!res.ok) continue;
			const text = (await res.text()).trim();
			if (!text.length) continue;
			const json = JSON.parse(text) as Parameters<typeof parseRealtimeJson>[0];
			const parsed = parseRealtimeJson(json);
			if (parsed) {
				const mapped = mapUserSymbolToSina(rawSymbol);
				return {
					...parsed,
					displaySymbol: mapped?.displaySymbol ?? parsed.displaySymbol,
				};
			}
		} catch {
			continue;
		}
	}

	return fetchEastmoneyQuoteFromKline(secid, rawSymbol);
}

async function fetchEastmoneyQuoteFromKline(secid: string, rawSymbol: string): Promise<MarketQuotePayload | null> {
	const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
	const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${encodeURIComponent(secid)}&klt=1&fqt=1&beg=${today}&end=${today}&fields1=f1&fields2=f51,f53`;
	try {
		const res = await fetch(url, {
			cache: "no-store",
			headers: {
				Referer: "https://quote.eastmoney.com/",
				"User-Agent": "Mozilla/5.0 (compatible; tradelovin-quote/1)",
			},
		});
		if (!res.ok) return null;
		const json = (await res.json()) as { data?: { klines?: string[] } };
		const last = json.data?.klines?.at(-1);
		if (!last) return null;
		const cols = last.split(",");
		const close = Number.parseFloat(cols[2] ?? "");
		if (!Number.isFinite(close) || close <= 0) return null;
		const mapped = mapUserSymbolToSina(rawSymbol);
		return {
			price: Math.round(close * 10000) / 10000,
			displaySymbol: mapped?.displaySymbol ?? "",
		};
	} catch {
		return null;
	}
}

export function parseEastmoneyKlineRow(row: string): KlineBar | null {
	const cols = row.split(",");
	if (cols.length < 7) return null;
	const open = Number.parseFloat(cols[1] ?? "");
	const close = Number.parseFloat(cols[2] ?? "");
	const high = Number.parseFloat(cols[3] ?? "");
	const low = Number.parseFloat(cols[4] ?? "");
	const volume = Number.parseFloat(cols[5] ?? "");
	const amount = Number.parseFloat(cols[6] ?? "");
	if (![open, close, high, low].every((v) => Number.isFinite(v) && v > 0)) return null;
	return {
		time: cols[0] ?? "",
		open,
		close,
		high,
		low,
		volume: Number.isFinite(volume) ? volume : 0,
		amount: Number.isFinite(amount) ? amount : 0,
	};
}

export async function fetchEastmoneyKline(
	rawSymbol: string,
	period: KlinePeriod,
	limit = 120,
): Promise<{ bars: KlineBar[] } | { error: string }> {
	const secid = toEastmoneySecId(rawSymbol);
	if (!secid) return { error: "symbol 无法映射到东方财富 secid" };

	const klt = PERIOD_TO_KLT[period];
	const end = new Date().toISOString().slice(0, 10).replaceAll("-", "");
	const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replaceAll("-", "");
	const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${encodeURIComponent(secid)}&klt=${klt}&fqt=1&beg=${start}&end=${end}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`;

	try {
		const res = await fetch(url, {
			cache: "no-store",
			headers: {
				Referer: "https://quote.eastmoney.com/",
				"User-Agent": "Mozilla/5.0 (compatible; tradelovin-kline/1)",
			},
		});
		if (!res.ok) return { error: `东方财富 K 线 HTTP ${res.status}` };
		const json = (await res.json()) as { data?: { klines?: string[]; name?: string } };
		const rows = json.data?.klines ?? [];
		if (!rows.length) return { error: "东方财富 K 线为空" };
		const bars = rows
			.map(parseEastmoneyKlineRow)
			.filter((bar): bar is KlineBar => bar != null)
			.slice(-limit);
		if (!bars.length) return { error: "东方财富 K 线解析失败" };
		return { bars };
	} catch (error) {
		return { error: error instanceof Error ? error.message : "东方财富 K 线请求失败" };
	}
}

export { parseRealtimeJson };
