import iconv from "iconv-lite";

import { mapUserSymbolToSina } from "@/lib/trade/symbol-mapping";

export type QuoteResult = {
	price: number;
	name?: string;
	sinaKey: string;
	displaySymbol: string;
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
		name: isHk
			? localizeHkName(cols[0]?.length ? cols[0] : undefined, locale, mapped.displaySymbol)
			: cols[0]?.length
				? cols[0]
				: undefined,
		sinaKey: mapped.sinaListKey,
		displaySymbol: mapped.displaySymbol,
	};
}
