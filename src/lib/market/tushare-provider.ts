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

async function requestTushare(
	apiName: string,
	params: Record<string, unknown>,
	fields?: string[],
): Promise<Array<Record<string, unknown>>> {
	const token = process.env.TUSHARE_TOKEN?.trim();
	if (!token) return [];

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
			if (res.status === 429 && attempt < 2) {
				await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
				continue;
			}
			return [];
		}
		const json = (await res.json()) as TushareResponse;
		const rows = json.data?.items ?? [];
		const headers = json.data?.fields ?? [];
		const mapped = rows.map((r) => toObject(headers, r));
		writeCache(cacheKey, mapped, 30_000);
		return mapped;
	}

	return [];
}

export async function fetchTradeCalendar(exchange = "SSE", dateYmd?: string): Promise<boolean | null> {
	const date = dateYmd ?? new Date().toISOString().slice(0, 10).replaceAll("-", "");
	const rows = await requestTushare("trade_cal", { exchange, start_date: date, end_date: date }, [
		"cal_date",
		"is_open",
	]);
	if (!rows.length) return null;
	return Number(rows[0]?.is_open ?? 0) === 1;
}

export async function fetchLatestDaily(tsCode: string): Promise<number | null> {
	const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
	const rows = await requestTushare("daily", { ts_code: tsCode, start_date: today, end_date: today }, [
		"ts_code",
		"trade_date",
		"close",
	]);
	if (!rows.length) return null;
	const close = Number(rows[0]?.close ?? NaN);
	return Number.isFinite(close) && close > 0 ? close : null;
}
