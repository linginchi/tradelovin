export const SYMBOL_FORMAT_ERROR_MESSAGE = "symbol 格式不合法，应输入 600519 或 600519.SH / 000001.SZ";
export const SYMBOL_INPUT_HINT_MESSAGE = "请输入合法代码，如 600519 或 600519.SH / 000001.SZ";

export function normalizeCnSymbol(raw: string): string {
	const clean = raw.trim().toUpperCase();
	const matched = clean.match(/^(\d{6})(?:\.(SH|SZ))?$/);
	if (!matched) return clean;
	const digits = matched[1];
	const expectedSuffix = digits.startsWith("6") || digits.startsWith("9") ? "SH" : "SZ";
	return `${digits}.${expectedSuffix}`;
}

export function isCanonicalCnSymbol(symbol: string): boolean {
	return /^\d{6}\.(SH|SZ)$/.test(symbol);
}
