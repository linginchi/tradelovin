export const SYMBOL_FORMAT_ERROR_MESSAGE =
	"symbol 格式不合法，应输入 600519、123（即 000123）或 600519.SH / 000001.SZ";
export const SYMBOL_INPUT_HINT_MESSAGE =
	"请输入合法代码，如 600519、123（可省略前导 0）或 600519.SH / 000001.SZ";

function padCnDigits(digits: string): string {
	return digits.padStart(6, "0");
}

function inferExchangeSuffix(digits: string): "SH" | "SZ" {
	return digits.startsWith("6") || digits.startsWith("9") ? "SH" : "SZ";
}

export function normalizeCnSymbol(raw: string): string {
	const clean = raw.trim().toUpperCase();
	const matched = clean.match(/^(\d{1,6})(?:\.(SH|SZ))?$/);
	if (!matched) return clean;
	const digits = padCnDigits(matched[1]);
	const explicitSuffix = matched[2];
	if (explicitSuffix) {
		return `${digits}.${explicitSuffix}`;
	}
	return `${digits}.${inferExchangeSuffix(digits)}`;
}

export function isCanonicalCnSymbol(symbol: string): boolean {
	return /^\d{6}\.(SH|SZ)$/.test(symbol.trim().toUpperCase());
}

/** 输入框展示用：去掉 .SH / .SZ 后缀 */
export function stripExchangeSuffix(symbol: string): string {
	return symbol.trim().toUpperCase().replace(/\.(SH|SZ)$/i, "");
}

/** 6 位纯数字或带 .SH/.SZ 后缀时 debounce 自动切换；1–5 位需 Enter / 失焦确认 */
export function shouldAutoSwitchCnSymbolInput(raw: string): boolean {
	const clean = raw.trim().toUpperCase();
	return /^\d{6}$/.test(clean) || /^\d{1,6}\.(SH|SZ)$/.test(clean);
}
