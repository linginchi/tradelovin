type TushareResponse = {

	code: number;

	msg: string | null;

	data?: {

		fields: string[];

		items: Array<Array<string | number | null>>;

	};

};



type CacheValue<T> = {

	expiresAt: number;

	value: T;

};



const cache = new Map<string, CacheValue<unknown>>();

const SHANGHAI_TZ = "Asia/Shanghai";



function readCache<T>(key: string): T | null {

	const hit = cache.get(key);

	if (!hit) return null;

	if (Date.now() > hit.expiresAt) {

		cache.delete(key);

		return null;

	}

	return hit.value as T;

}



function writeCache<T>(key: string, value: T, ttlMs: number) {

	cache.set(key, {

		expiresAt: Date.now() + ttlMs,

		value,

	});

}



function toObject(fields: string[], row: Array<string | number | null>): Record<string, unknown> {

	const out: Record<string, unknown> = {};

	for (let i = 0; i < fields.length; i += 1) out[fields[i] ?? `f${i}`] = row[i];

	return out;

}



/** 上海时区 YYYYMMDD */

export function shanghaiYmd(date = new Date()): string {

	return new Intl.DateTimeFormat("en-CA", {

		timeZone: SHANGHAI_TZ,

		year: "numeric",

		month: "2-digit",

		day: "2-digit",

	}).format(date).replaceAll("-", "");

}



function shanghaiYmdDaysAgo(days: number): string {

	return shanghaiYmd(new Date(Date.now() - days * 86_400_000));

}



const DEFAULT_CACHE_TTL_MS = 30_000;

const RT_CACHE_TTL_MS = 15_000;



async function requestTushare(

	apiName: string,

	params: Record<string, unknown>,

	fields?: string[],

	cacheTtlMs = DEFAULT_CACHE_TTL_MS,

): Promise<Array<Record<string, unknown>>> {

	const token = process.env.TUSHARE_TOKEN?.trim();

	if (!token) {

		console.warn("[quote.tushare] missing TUSHARE_TOKEN", { apiName });

		return [];

	}



	const cacheKey = JSON.stringify({ apiName, params, fields });

	const cached = readCache<Array<Record<string, unknown>>>(cacheKey);

	if (cached) return cached;



	const body = {

		api_name: apiName,

		token,

		params,

		fields: fields?.join(","),

	};



	for (let attempt = 0; attempt < 3; attempt += 1) {

		const res = await fetch("https://api.tushare.pro", {

			method: "POST",

			headers: { "Content-Type": "application/json" },

			body: JSON.stringify(body),

			cache: "no-store",

		});

		if (!res.ok) {

			console.warn("[quote.tushare] http_error", { apiName, status: res.status, attempt });

			if (res.status === 429 && attempt < 2) {

				await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));

				continue;

			}

			return [];

		}

		const json = (await res.json()) as TushareResponse;

		if (json.code !== 0) {

			console.warn("[quote.tushare] api_error", { apiName, code: json.code, msg: json.msg, params });

			return [];

		}

		const rows = json.data?.items ?? [];

		const headers = json.data?.fields ?? [];

		const mapped = rows.map((r) => toObject(headers, r));

		writeCache(cacheKey, mapped, cacheTtlMs);

		return mapped;

	}



	return [];

}



export async function fetchTradeCalendar(exchange = "SSE", dateYmd?: string): Promise<boolean | null> {

	const date = dateYmd ?? shanghaiYmd();

	const rows = await requestTushare("trade_cal", { exchange, start_date: date, end_date: date }, [

		"cal_date",

		"is_open",

	]);

	if (!rows.length) return null;

	return Number(rows[0]?.is_open ?? 0) === 1;

}



/** 最近一个交易日收盘价（查近 10 个自然日，Asia/Shanghai 日期） */

export async function fetchLatestDaily(tsCode: string): Promise<number | null> {

	const end = shanghaiYmd();

	const start = shanghaiYmdDaysAgo(10);

	const rows = await requestTushare("daily", { ts_code: tsCode, start_date: start, end_date: end }, [

		"ts_code",

		"trade_date",

		"close",

	]);

	if (!rows.length) return null;

	const latest = [...rows].sort((a, b) => String(b.trade_date ?? "").localeCompare(String(a.trade_date ?? "")))[0];

	const close = Number(latest?.close ?? NaN);

	return Number.isFinite(close) && close > 0 ? close : null;

}



/** Tushare 实时日线 rt_k；无权限/失败返回 null，调用方降级 */

export async function fetchRtDaily(tsCode: string): Promise<number | null> {

	const rows = await requestTushare("rt_k", { ts_code: tsCode }, ["ts_code", "close"], RT_CACHE_TTL_MS);

	if (!rows.length) return null;

	const close = Number(rows[0]?.close ?? NaN);

	return Number.isFinite(close) && close > 0 ? close : null;

}



function toPositiveNumber(raw: unknown): number | undefined {

	const v = Number(raw ?? NaN);

	return Number.isFinite(v) && v > 0 ? v : undefined;

}



const FUNDAMENTAL_CACHE_TTL_MS = 10 * 60_000;



export type DailyBasicSnapshot = {

	/** 总市值（万元） */

	totalMv?: number;

	/** 流通市值（万元） */

	circMv?: number;

	peTtm?: number;

	pb?: number;

	/** 换手率（%） */

	turnoverRate?: number;

	volumeRatio?: number;

};



/** 最新一日 daily_basic 估值指标；token 缺失/无权限返回 null，调用方降级 */

export async function fetchDailyBasic(tsCode: string): Promise<DailyBasicSnapshot | null> {

	const rows = await requestTushare(

		"daily_basic",

		{ ts_code: tsCode, start_date: shanghaiYmdDaysAgo(10) },

		["ts_code", "trade_date", "total_mv", "circ_mv", "pe_ttm", "pb", "turnover_rate", "volume_ratio"],

		FUNDAMENTAL_CACHE_TTL_MS,

	);

	if (!rows.length) return null;

	const latest = [...rows].sort((a, b) => String(b.trade_date ?? "").localeCompare(String(a.trade_date ?? "")))[0];

	if (!latest) return null;

	return {

		totalMv: toPositiveNumber(latest.total_mv),

		circMv: toPositiveNumber(latest.circ_mv),

		peTtm: toPositiveNumber(latest.pe_ttm),

		pb: toPositiveNumber(latest.pb),

		turnoverRate: toPositiveNumber(latest.turnover_rate),

		volumeRatio: toPositiveNumber(latest.volume_ratio),

	};

}

export type Daily20dStats = {

	/** 近 20 交易日均价（收盘价均值） */

	avgPrice20d?: number;

	/** 近 20 交易日平均成交额（元；daily.amount 单位为千元，已折算） */

	avgAmount20d?: number;

};



/** 近 20 个交易日的均价与平均成交额；数据不足或失败返回 null */

export async function fetchDaily20d(tsCode: string): Promise<Daily20dStats | null> {

	const rows = await requestTushare(

		"daily",

		{ ts_code: tsCode, start_date: shanghaiYmdDaysAgo(45) },

		["ts_code", "trade_date", "close", "amount"],

		FUNDAMENTAL_CACHE_TTL_MS,

	);

	if (!rows.length) return null;

	const recent = [...rows]

		.sort((a, b) => String(b.trade_date ?? "").localeCompare(String(a.trade_date ?? "")))

		.slice(0, 20);

	const closes = recent.map((r) => toPositiveNumber(r.close)).filter((v): v is number => v != null);

	const amounts = recent.map((r) => toPositiveNumber(r.amount)).filter((v): v is number => v != null);

	if (!closes.length && !amounts.length) return null;

	return {

		avgPrice20d: closes.length ? closes.reduce((a, b) => a + b, 0) / closes.length : undefined,

		avgAmount20d: amounts.length ? (amounts.reduce((a, b) => a + b, 0) / amounts.length) * 1000 : undefined,

	};

}
