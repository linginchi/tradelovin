export type SearchParamLike = {
	get(name: string): string | null;
};

export function normalizeSymbolFilter(input: string | null | undefined): string {
	return String(input ?? "").trim().toUpperCase();
}

export function parseViewParam<T extends string>(
	input: string | null | undefined,
	allowed: readonly T[],
	fallback: T,
): T {
	const value = String(input ?? "").trim().toLowerCase();
	return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function isFailedEventView(input: string | null | undefined): boolean {
	return String(input ?? "").trim().toLowerCase() === "failed";
}

export function buildTradeFailureHref(symbol?: string): string {
	const normalized = normalizeSymbolFilter(symbol);
	if (normalized) {
		return `/trade?eventView=failed&symbol=${encodeURIComponent(normalized)}`;
	}
	return "/trade?eventView=failed";
}

export function buildFailureListHref(basePath: "/watchlist" | "/conditions", symbol?: string): string {
	const normalized = normalizeSymbolFilter(symbol);
	if (normalized) {
		return `${basePath}?view=failed&symbol=${encodeURIComponent(normalized)}`;
	}
	return `${basePath}?view=failed`;
}
