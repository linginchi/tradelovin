import iconv from "iconv-lite";

import { mapUserSymbolToSina } from "@/lib/trade/symbol-mapping";
import { localizeNameBySymbol } from "@/lib/trade/get-current-price";

export type MarketQuotePayload = {
	price: number;
	name?: string;
	displaySymbol: string;
};

function parseTencentLine(body: string): MarketQuotePayload | null {
	const cols = body.split("~");
	if (cols.length < 4) return null;
	const price = Number.parseFloat(cols[3]?.replace(/,/g, "") ?? "");
	if (!Number.isFinite(price) || price <= 0) return null;
	const name = cols[1]?.length ? cols[1] : undefined;
	const code = cols[2]?.length ? cols[2] : undefined;
	return {
		price: Math.round(price * 10000) / 10000,
		name,
		displaySymbol: (code ?? "").toUpperCase(),
	};
}

/** 腾讯 qt.gtimg.cn 行情；A 股/港股 */
export async function fetchTencentQuote(rawSymbol: string, locale = "zh"): Promise<MarketQuotePayload | null> {
	const mapped = mapUserSymbolToSina(rawSymbol);
	if (!mapped) return null;

	const url = `https://qt.gtimg.cn/q=${encodeURIComponent(mapped.sinaListKey)}`;
	const res = await fetch(url, {
		cache: "no-store",
		headers: {
			Referer: "https://gu.qq.com/",
			"User-Agent": "Mozilla/5.0 (compatible; tradelovin-quote/1)",
		},
	});

	if (!res.ok) return null;

	const txt = iconv.decode(Buffer.from(await res.arrayBuffer()), "gbk");
	const escapedKey = mapped.sinaListKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = txt.match(new RegExp(`v_${escapedKey}="([^"]*)"`, "i"));
	if (!match?.[1]?.trim()) return null;

	const parsed = parseTencentLine(match[1].trim());
	if (!parsed) return null;

	return {
		...parsed,
		displaySymbol: parsed.displaySymbol || mapped.displaySymbol,
		name: localizeNameBySymbol(rawSymbol, parsed.name, locale),
	};
}

export { parseTencentLine };
