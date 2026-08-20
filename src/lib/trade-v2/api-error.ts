import { SYMBOL_FORMAT_ERROR_MESSAGE } from "@/lib/trade/symbol-normalizer";
import { explainOperationFailure } from "@/lib/trade-v2/operation-guidance";

export { SYMBOL_FORMAT_ERROR_MESSAGE };

export function normalizeTradeApiError(error: unknown, fallback: string): string {
	const message =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: fallback;
	if (!message) return explainOperationFailure(fallback);
	if (message.includes("symbol")) {
		return explainOperationFailure(SYMBOL_FORMAT_ERROR_MESSAGE);
	}
	return explainOperationFailure(message, fallback);
}
