import assert from "node:assert/strict";
import test from "node:test";

import {
	resolvePositionModeAfterSettingsLoad,
	shouldFillPriceFromQuote,
} from "@/lib/trade-v2/session-settings";

test("after hydrate, filling a book price keeps the user's short mode", () => {
	assert.equal(
		resolvePositionModeAfterSettingsLoad({
			hydrated: true,
			current: "short",
			loadedDefault: "long",
		}),
		"short",
	);
});

test("first settings load still applies the saved default mode", () => {
	assert.equal(
		resolvePositionModeAfterSettingsLoad({
			hydrated: false,
			current: "long",
			loadedDefault: "short",
		}),
		"short",
	);
});

test("quote last price fills only when the order price is still empty", () => {
	assert.equal(shouldFillPriceFromQuote(""), true);
	assert.equal(shouldFillPriceFromQuote("56.46"), false);
});
