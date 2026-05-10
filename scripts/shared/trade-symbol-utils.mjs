export const SYMBOL_FORMAT_HINT = "CN stock code like 600519 or 600519.SH/000001.SZ";

export function normalizeCnSymbol(raw) {
	const clean = String(raw ?? "").trim().toUpperCase();
	const matched = clean.match(/^(\d{6})(?:\.(SH|SZ))?$/);
	if (!matched) return clean;
	const digits = matched[1];
	const expectedSuffix = digits.startsWith("6") || digits.startsWith("9") ? "SH" : "SZ";
	return `${digits}.${expectedSuffix}`;
}

export function isCanonicalCnSymbol(symbol) {
	return /^\d{6}\.(SH|SZ)$/.test(String(symbol ?? "").toUpperCase());
}

export function assertCanonicalSymbol(symbolValue, context, assertFn) {
	const canonical = String(symbolValue ?? "").toUpperCase();
	if (typeof assertFn === "function") {
		assertFn(isCanonicalCnSymbol(canonical), `${context} is canonical`);
		return canonical;
	}
	if (!isCanonicalCnSymbol(canonical)) {
		throw new Error(`${context} is not canonical: ${canonical}`);
	}
	return canonical;
}
