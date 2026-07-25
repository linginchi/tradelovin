import iconv from "iconv-lite";

import { mapUserSymbolToSina } from "@/lib/trade/symbol-mapping";

export type QuoteResult = {
	price: number;
	name?: string;
	sinaKey: string;
	displaySymbol: string;
};

export type SinaDepthLevel = {
	level: number;
	price: number;
	volume: number;
};

export type SinaQuoteDetail = {
	price: number;
	name?: string;
	sinaKey: string;
	displaySymbol: string;
	open?: number;
	prevClose?: number;
	high?: number;
	low?: number;
	/** 成交量（股） */
	volume?: number;
	/** 成交额（元） */
	amount?: number;
	/** A 股真实五档；港股无深度 */
	depth?: {
		asks: SinaDepthLevel[];
		bids: SinaDepthLevel[];
	};
};

const SIMPLIFIED_TO_TRADITIONAL: Record<string, string> = {
	万: "萬",
	东: "東",
	业: "業",
	乐: "樂",
	云: "雲",
	亚: "亞",
	亿: "億",
	优: "優",
	会: "會",
	伟: "偉",
	传: "傳",
	体: "體",
	价: "價",
	众: "眾",
	伤: "傷",
	伦: "倫",
	信: "信",
	储: "儲",
	关: "關",
	养: "養",
	农: "農",
	创: "創",
	务: "務",
	势: "勢",
	动: "動",
	华: "華",
	医: "醫",
	协: "協",
	发: "發",
	变: "變",
	台: "臺",
	号: "號",
	后: "後",
	启: "啟",
	员: "員",
	国: "國",
	图: "圖",
	围: "圍",
	圣: "聖",
	场: "場",
	复: "復",
	头: "頭",
	奥: "奧",
	学: "學",
	实: "實",
	宝: "寶",
	导: "導",
	岛: "島",
	师: "師",
	广: "廣",
	庆: "慶",
	库: "庫",
	张: "張",
	彦: "彥",
	德: "德",
	总: "總",
	恒: "恆",
	悦: "悅",
	户: "戶",
	扬: "揚",
	执: "執",
	扩: "擴",
	报: "報",
	数: "數",
	时: "時",
	晋: "晉",
	晓: "曉",
	术: "術",
	杂: "雜",
	权: "權",
	来: "來",
	杨: "楊",
	杰: "傑",
	构: "構",
	标: "標",
	桥: "橋",
	气: "氣",
	汇: "匯",
	汉: "漢",
	沪: "滬",
	泽: "澤",
	润: "潤",
	湾: "灣",
	热: "熱",
	爱: "愛",
	环: "環",
	电: "電",
	疗: "療",
	监: "監",
	盘: "盤",
	码: "碼",
	矿: "礦",
	稳: "穩",
	积: "積",
	税: "稅",
	称: "稱",
	网: "網",
	联: "聯",
	腾: "騰",
	药: "藥",
	览: "覽",
	讯: "訊",
	证: "證",
	设: "設",
	贸: "貿",
	资: "資",
	赛: "賽",
	赵: "趙",
	车: "車",
	软: "軟",
	迈: "邁",
	达: "達",
	远: "遠",
	邮: "郵",
	里: "裡",
	鉴: "鑑",
	银: "銀",
	销: "銷",
	锦: "錦",
	阳: "陽",
	际: "際",
	险: "險",
	飞: "飛",
	饮: "飲",
	马: "馬",
	麦: "麥",
	龙: "龍",
};

function toTraditional(input: string): string {
	return [...input].map((ch) => SIMPLIFIED_TO_TRADITIONAL[ch] ?? ch).join("");
}

function localizeHkName(name: string | undefined, locale: string, fallbackSymbol: string): string | undefined {
	if (locale === "en") return fallbackSymbol;
	if (!name) return undefined;
	if (locale === "zh-TW") return toTraditional(name);
	return name;
}

export function localizeNameBySymbol(
	symbol: string,
	name: string | undefined,
	locale: string,
): string | undefined {
	const mapped = mapUserSymbolToSina(symbol);
	if (mapped?.sinaListKey.startsWith("hk")) {
		return localizeHkName(name, locale, mapped.displaySymbol);
	}
	return name;
}

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

async function fetchSinaCols(sinaListKey: string): Promise<string[] | null> {
	const url = `https://hq.sinajs.cn/list=${encodeURIComponent(sinaListKey)}`;
	let res: Response;
	try {
		res = await fetch(url, {
			cache: "no-store",
			headers: {
				Referer: "https://finance.sina.com.cn/",
				"User-Agent": "Mozilla/5.0 (compatible; tradelovin-quote/1)",
			},
		});
	} catch (error) {
		console.warn("[quote.sina] fetch_error", {
			sinaListKey,
			error: error instanceof Error ? error.message : String(error),
		});
		return null;
	}

	if (!res.ok) {
		console.warn("[quote.sina] http_error", { sinaListKey, status: res.status });
		return null;
	}

	const txt = iconv.decode(Buffer.from(await res.arrayBuffer()), "gb2312");
	const escapedKey = sinaListKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const m = txt.match(new RegExp(`hq_str_${escapedKey}="([^"]*)"`, "i"));
	if (!m?.[1]) {
		console.warn("[quote.sina] parse_miss", { sinaListKey, preview: txt.slice(0, 120) });
		return null;
	}

	const body = m[1].trim();
	if (!body.length) {
		console.warn("[quote.sina] empty_body", { sinaListKey });
		return null;
	}

	return body.split(",").map((c) => c.trim());
}

/** 新浪财经行情；不可用返回 null（由调用方提示「暂时无法获取行情」）；可用 SIM_QUOTE_PRICE_OVERRIDE 覆盖 */
export async function getCurrentPrice(rawSymbol: string, locale = "zh"): Promise<QuoteResult | null> {
	const mapped = mapUserSymbolToSina(rawSymbol);
	if (!mapped) return null;

	const overrideEnv = process.env.SIM_QUOTE_PRICE_OVERRIDE?.trim();
	if (overrideEnv) {
		const pv = Number(overrideEnv);
		if (Number.isFinite(pv) && pv > 0) {
			return {
				price: Math.round(pv * 10000) / 10000,
				name: localizeHkName("(override)", locale, mapped.displaySymbol),
				sinaKey: mapped.sinaListKey,
				displaySymbol: mapped.displaySymbol,
			};
		}
	}

	const cols = await fetchSinaCols(mapped.sinaListKey);
	if (!cols) return null;
	const isHk = mapped.sinaListKey.startsWith("hk");

	const pv = parseCsvPrice(cols, isHk);
	if (pv == null || !Number.isFinite(pv)) {
		console.warn("[quote.sina] invalid_price", { sinaListKey: mapped.sinaListKey, isHk });
		return null;
	}

	return {
		price: Math.round(pv * 10000) / 10000,
		name: isHk
			? localizeHkName(cols[0]?.length ? cols[0] : undefined, locale, mapped.displaySymbol)
			: cols[0]?.length
				? cols[0]
				: undefined,
		sinaKey: mapped.sinaListKey,
		displaySymbol: mapped.displaySymbol,
	};
}

function parseNum(raw: string | undefined): number | undefined {
	if (raw == null || !raw.length) return undefined;
	const v = parseFloat(raw.replace(/,/g, ""));
	return Number.isFinite(v) ? v : undefined;
}

function parsePositive(raw: string | undefined): number | undefined {
	const v = parseNum(raw);
	return v != null && v > 0 ? v : undefined;
}

/**
 * 解析 A 股五档：买五档在 cols[10..19]、卖五档在 cols[20..29]，每档为 (量,价) 成对。
 */
function parseAShareDepth(cols: string[]): SinaQuoteDetail["depth"] {
	const bids: SinaDepthLevel[] = [];
	const asks: SinaDepthLevel[] = [];
	for (let i = 0; i < 5; i += 1) {
		const bidVol = parsePositive(cols[10 + i * 2]);
		const bidPrice = parsePositive(cols[11 + i * 2]);
		if (bidVol != null && bidPrice != null) {
			bids.push({ level: i + 1, price: bidPrice, volume: bidVol });
		}
		const askVol = parsePositive(cols[20 + i * 2]);
		const askPrice = parsePositive(cols[21 + i * 2]);
		if (askVol != null && askPrice != null) {
			asks.push({ level: i + 1, price: askPrice, volume: askVol });
		}
	}
	if (!asks.length && !bids.length) return undefined;
	return { asks, bids };
}

type DetailCacheValue = {
	expiresAt: number;
	value: SinaQuoteDetail | null;
};

const detailCache = new Map<string, DetailCacheValue>();
const DETAIL_CACHE_TTL_MS = 3000;

/**
 * 新浪完整行情明细（OHLC / 量额 / A 股真实五档）。
 * 仅作信息增强：任何字段缺失为 undefined，整体失败返回 null，调用方降级处理。
 */
export async function getSinaQuoteDetail(rawSymbol: string, locale = "zh"): Promise<SinaQuoteDetail | null> {
	const mapped = mapUserSymbolToSina(rawSymbol);
	if (!mapped) return null;

	const cacheKey = `${mapped.sinaListKey}:${locale}`;
	const hit = detailCache.get(cacheKey);
	if (hit && Date.now() <= hit.expiresAt) return hit.value;

	const cols = await fetchSinaCols(mapped.sinaListKey);
	const isHk = mapped.sinaListKey.startsWith("hk");

	let detail: SinaQuoteDetail | null = null;
	if (cols) {
		const pv = parseCsvPrice(cols, isHk);
		if (pv != null && Number.isFinite(pv)) {
			if (isHk) {
				// 港股：0 英文名, 1 中文名, 2 今开, 3 昨收, 4 最高, 5 最低, 6 现价, 11 成交额, 12 成交量
				detail = {
					price: Math.round(pv * 10000) / 10000,
					name: localizeHkName(cols[1]?.length ? cols[1] : undefined, locale, mapped.displaySymbol),
					sinaKey: mapped.sinaListKey,
					displaySymbol: mapped.displaySymbol,
					open: parsePositive(cols[2]),
					prevClose: parsePositive(cols[3]),
					high: parsePositive(cols[4]),
					low: parsePositive(cols[5]),
					amount: parsePositive(cols[11]),
					volume: parsePositive(cols[12]),
				};
			} else {
				// A 股：0 名称, 1 今开, 2 昨收, 3 现价, 4 最高, 5 最低, 8 成交量(股), 9 成交额(元)
				detail = {
					price: Math.round(pv * 10000) / 10000,
					name: cols[0]?.length ? cols[0] : undefined,
					sinaKey: mapped.sinaListKey,
					displaySymbol: mapped.displaySymbol,
					open: parsePositive(cols[1]),
					prevClose: parsePositive(cols[2]),
					high: parsePositive(cols[4]),
					low: parsePositive(cols[5]),
					volume: parsePositive(cols[8]),
					amount: parsePositive(cols[9]),
					depth: parseAShareDepth(cols),
				};
			}
		}
	}

	detailCache.set(cacheKey, { expiresAt: Date.now() + DETAIL_CACHE_TTL_MS, value: detail });
	return detail;
}
