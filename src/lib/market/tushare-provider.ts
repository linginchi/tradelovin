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

export type TushareErrorCategory =
	| "token_missing"
	| "permission"
	| "rate_limit"
	| "network"
	| "api_error"
	| "empty";

export type TushareFailure = {
	ok: false;
	category: TushareErrorCategory;
	apiName: string;
	code?: number;
	msg?: string | null;
};

export type TushareSuccess<T> = {
	ok: true;
	data: T;
};

export type TushareResult<T> = TushareSuccess<T> | TushareFailure;

export type TushareDailyResult = {
	value: number | null;
	reason?: string;
	failure?: TushareFailure;
};

export type TushareCalendarResult = {
	value: boolean | null;
	reason?: string;
	failure?: TushareFailure;
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

function classifyTushareApiError(code: number, msg: string | null): TushareErrorCategory {
	const text = (msg ?? "").toLowerCase();
	if (code === 2002 || text.includes("权限") || text.includes("permission")) return "permission";
	if (
		code === 40203 ||
		text.includes("限流") ||
		text.includes("频率") ||
		text.includes("too many") ||
		text.includes("rate")
	) {
		return "rate_limit";
	}
	if (text.includes("token") && (text.includes("无效") || text.includes("invalid") || text.includes("过期"))) {
		return "permission";
	}
	return "api_error";
}

function logTushareFailure(failure: TushareFailure) {
	console.warn("[market.tushare]", {
		apiName: failure.apiName,
		category: failure.category,
		code: failure.code ?? null,
		msg: failure.msg ?? null,
	});
}

function buildFailure(
	apiName: string,
	category: TushareErrorCategory,
	code?: number,
	msg?: string | null,
): TushareFailure {
	const failure: TushareFailure = { ok: false, category, apiName, code, msg };
	logTushareFailure(failure);
	return failure;
}

async function requestTushare(
	apiName: string,
	params: Record<string, unknown>,
	fields?: string[],
): Promise<TushareResult<Array<Record<string, unknown>>>> {
	const token = process.env.TUSHARE_TOKEN?.trim();
	if (!token) {
		return buildFailure(apiName, "token_missing", undefined, "TUSHARE_TOKEN is not set");
	}

	const cacheKey = JSON.stringify({ apiName, params, fields });
	const cached = readCache<Array<Record<string, unknown>>>(cacheKey);
	if (cached) return { ok: true, data: cached };

	const body = {
		api_name: apiName,
		token,
		params,
		fields: fields?.join(","),
	};

	for (let attempt = 0; attempt < 3; attempt += 1) {
		let res: Response;
		try {
			res = await fetch("https://api.tushare.pro", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
				cache: "no-store",
			});
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			if (attempt < 2) {
				await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
				continue;
			}
			return buildFailure(apiName, "network", undefined, msg);
		}

		if (!res.ok) {
			if (res.status === 429 && attempt < 2) {
				await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
				continue;
			}
			return buildFailure(
				apiName,
				res.status === 429 ? "rate_limit" : "network",
				res.status,
				`HTTP ${res.status}`,
			);
		}

		const json = (await res.json()) as TushareResponse;
		if (json.code !== 0) {
			return buildFailure(apiName, classifyTushareApiError(json.code, json.msg), json.code, json.msg);
		}

		const rows = json.data?.items ?? [];
		const headers = json.data?.fields ?? [];
		const mapped = rows.map((r) => toObject(headers, r));
		if (!mapped.length) {
			return buildFailure(apiName, "empty", json.code, json.msg ?? "empty response");
		}

		writeCache(cacheKey, mapped, 30_000);
		return { ok: true, data: mapped };
	}

	return buildFailure(apiName, "network", undefined, "exhausted retries");
}

export async function fetchTradeCalendar(exchange = "SSE", dateYmd?: string): Promise<TushareCalendarResult> {
	const date = dateYmd ?? new Date().toISOString().slice(0, 10).replaceAll("-", "");
	const result = await requestTushare("trade_cal", { exchange, start_date: date, end_date: date }, [
		"cal_date",
		"is_open",
	]);
	if (!result.ok) {
		return {
			value: null,
			reason: result.category,
			failure: result,
		};
	}
	return {
		value: Number(result.data[0]?.is_open ?? 0) === 1,
	};
}

export async function fetchLatestDaily(tsCode: string): Promise<TushareDailyResult> {
	const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
	const result = await requestTushare("daily", { ts_code: tsCode, start_date: today, end_date: today }, [
		"ts_code",
		"trade_date",
		"close",
	]);
	if (!result.ok) {
		return {
			value: null,
			reason: result.category,
			failure: result,
		};
	}
	const close = Number(result.data[0]?.close ?? NaN);
	if (!Number.isFinite(close) || close <= 0) {
		const failure = buildFailure("daily", "empty", undefined, "missing close for today");
		return { value: null, reason: failure.category, failure };
	}
	return { value: close };
}
