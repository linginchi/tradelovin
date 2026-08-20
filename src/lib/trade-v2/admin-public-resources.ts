import { isCanonicalCnSymbol, normalizeCnSymbol } from "@/lib/trade/symbol-normalizer";
import { SYMBOL_FORMAT_ERROR_MESSAGE } from "@/lib/trade-v2/api-error";

export type PublicResourceUpsertInput = {
	symbol: string;
	name: string | null;
	long_limit: number;
	short_limit: number;
};

export function parsePublicResourceUpsert(
	body: unknown,
): { ok: true; data: PublicResourceUpsertInput } | { ok: false; error: string } {
	if (!body || typeof body !== "object") {
		return { ok: false, error: "请求体格式错误" };
	}
	const rec = body as Record<string, unknown>;
	const symbol = normalizeCnSymbol(typeof rec.symbol === "string" ? rec.symbol : "");
	if (!isCanonicalCnSymbol(symbol)) {
		return { ok: false, error: SYMBOL_FORMAT_ERROR_MESSAGE };
	}
	let name: string | null = null;
	if (typeof rec.name === "string") {
		const trimmed = rec.name.trim();
		name = trimmed ? trimmed.slice(0, 80) : null;
	}
	const longLimit = typeof rec.long_limit === "number" ? rec.long_limit : Number(rec.long_limit);
	const shortLimit = typeof rec.short_limit === "number" ? rec.short_limit : Number(rec.short_limit);
	if (!Number.isInteger(longLimit) || longLimit < 0) {
		return { ok: false, error: "long_limit 必须为非负整数" };
	}
	if (!Number.isInteger(shortLimit) || shortLimit < 0) {
		return { ok: false, error: "short_limit 必须为非负整数" };
	}
	return {
		ok: true,
		data: {
			symbol,
			name,
			long_limit: longLimit,
			short_limit: shortLimit,
		},
	};
}

export function parsePublicResourceSymbol(
	raw: unknown,
): { ok: true; symbol: string } | { ok: false; error: string } {
	const symbol = normalizeCnSymbol(typeof raw === "string" ? raw : "");
	if (!isCanonicalCnSymbol(symbol)) {
		return { ok: false, error: SYMBOL_FORMAT_ERROR_MESSAGE };
	}
	return { ok: true, symbol };
}

export function personalQuotaBlocksDelete(
	rows: Array<{ long_quota?: number; short_quota?: number }>,
	dynamicQuantitySum: number,
): boolean {
	const occupied = rows.some(
		(row) => Number(row.long_quota ?? 0) > 0 || Number(row.short_quota ?? 0) > 0,
	);
	return occupied || dynamicQuantitySum > 0;
}
