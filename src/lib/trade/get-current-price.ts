import iconv from "iconv-lite";

import { mapUserSymbolToSina } from "@/lib/trade/symbol-mapping";

export type QuoteResult = {
	price: number;
	name?: string;
	sinaKey: string;
	displaySymbol: string;
};

function parseCsvPrice(cols: string[], isHk: boolean): number | null {
	if (!isHk) {
		const p = parseFloat((cols[3] ?? "").replace(/,/g, ""));
		return Number.isFinite(p) && p > 0 ? p : null;
	}
	const tryIdx = [6, 11, 3, 12, 10, 9, 8, 7, 5, 4];
	for (const i of tryIdx) {
		const raw = cols[i];
		if (raw == null) continue;
		const p = parseFloat(raw.replace(/,/g, ""));
		if (!Number.isFinite(p) || p <= 0) continue;
		// 排除明显成交额/成交量的极大整数
		if (p >= 500000 && p % 100 === 0) continue;
		return p;
	}
	return null;
}

/** 新浪财经行情；不可用返回 null（由调用方提示「暂时无法获取行情」）；可用 SIM_QUOTE_PRICE_OVERRIDE 覆盖 */
export async function getCurrentPrice(rawSymbol: string): Promise<QuoteResult | null> {
	const mapped = mapUserSymbolToSina(rawSymbol);
	if (!mapped) return null;

	const overrideEnv = process.env.SIM_QUOTE_PRICE_OVERRIDE?.trim();
	if (overrideEnv) {
		const pv = Number(overrideEnv);
		if (Number.isFinite(pv) && pv > 0) {
			return {
				price: Math.round(pv * 10000) / 10000,
				name: "(override)",
				sinaKey: mapped.sinaListKey,
				displaySymbol: mapped.displaySymbol,
			};
		}
	}

	const url = `https://hq.sinajs.cn/list=${encodeURIComponent(mapped.sinaListKey)}`;
	const res = await fetch(url, {
		cache: "no-store",
		headers: {
			Referer: "https://finance.sina.com.cn/",
			"User-Agent": "Mozilla/5.0 (compatible; tradelovin-quote/1)",
		},
	});

	if (!res.ok) return null;

	const txt = iconv.decode(Buffer.from(await res.arrayBuffer()), "gb2312");
	const escapedKey = mapped.sinaListKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const m = txt.match(new RegExp(`hq_str_${escapedKey}="([^"]*)"`, "i"));
	if (!m?.[1]) return null;

	const body = m[1].trim();
	if (!body.length) return null;

	const cols = body.split(",").map((c) => c.trim());
	const isHk = mapped.sinaListKey.startsWith("hk");

	const pv = parseCsvPrice(cols, isHk);
	if (pv == null || !Number.isFinite(pv)) return null;

	return {
		price: Math.round(pv * 10000) / 10000,
		name: cols[0]?.length ? cols[0] : undefined,
		sinaKey: mapped.sinaListKey,
		displaySymbol: mapped.displaySymbol,
	};
}
