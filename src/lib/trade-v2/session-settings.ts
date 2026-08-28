export type TradePositionMode = "long" | "short";

/** After the first settings hydrate, later reloads must not clobber the in-session mode. */
export function resolvePositionModeAfterSettingsLoad(input: {
	hydrated: boolean;
	current: TradePositionMode;
	loadedDefault: TradePositionMode | string | null | undefined;
}): TradePositionMode {
	if (input.hydrated) return input.current === "short" ? "short" : "long";
	return input.loadedDefault === "short" ? "short" : "long";
}

/** Last quote tick may seed an empty ticket; it must not overwrite a price the user just clicked. */
export function shouldFillPriceFromQuote(currentPrice: string): boolean {
	return currentPrice.trim() === "";
}
