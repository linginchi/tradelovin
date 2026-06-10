export const SYMBOL_FORMAT_HINT = "CN stock code like 600519, 123 (→000123), or 600519.SH/000001.SZ";

function padCnDigits(digits) {
	return digits.padStart(6, "0");
}

function inferExchangeSuffix(digits) {
	return digits.startsWith("6") || digits.startsWith("9") ? "SH" : "SZ";
}

export function normalizeCnSymbol(raw) {
	const clean = String(raw ?? "").trim().toUpperCase();
	const matched = clean.match(/^(\d{1,6})(?:\.(SH|SZ))?$/);
	if (!matched) return clean;
	const digits = padCnDigits(matched[1]);
	const explicitSuffix = matched[2];
	if (explicitSuffix) {
		return `${digits}.${explicitSuffix}`;
	}
	return `${digits}.${inferExchangeSuffix(digits)}`;
}

export function isCanonicalCnSymbol(symbol) {
	return /^\d{6}\.(SH|SZ)$/.test(String(symbol ?? "").trim().toUpperCase());
}

export function shouldAutoSwitchCnSymbolInput(raw) {
	const clean = String(raw ?? "").trim().toUpperCase();
	return /^\d{6}$/.test(clean) || /^\d{1,6}\.(SH|SZ)$/.test(clean);
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
