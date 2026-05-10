import { SYMBOL_FORMAT_ERROR_MESSAGE } from "@/lib/trade/symbol-normalizer";

export { SYMBOL_FORMAT_ERROR_MESSAGE };

export function normalizeTradeApiError(error: unknown, fallback: string): string {
	const message = error instanceof Error ? error.message : fallback;
	if (!message) return fallback;
	if (message.includes("symbol")) {
		return SYMBOL_FORMAT_ERROR_MESSAGE;
	}
	return message;
}
