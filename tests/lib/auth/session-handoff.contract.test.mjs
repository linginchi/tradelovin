import assert from "node:assert/strict";
import test from "node:test";

import {
	buildCanonicalHandoffUrl,
	needsOverseasSessionHandoff,
	sanitizeNextPath,
} from "../../../src/lib/auth/session-handoff.mjs";

test("legacy overseas hosts need session handoff; mainland and canonical do not", () => {
	assert.equal(needsOverseasSessionHandoff("tradelovin.com"), true);
	assert.equal(needsOverseasSessionHandoff("www.tradelovin.com"), true);
	assert.equal(needsOverseasSessionHandoff("leolearnstotrade.com"), false);
	assert.equal(needsOverseasSessionHandoff("xeoaxis.com"), false);
	assert.equal(needsOverseasSessionHandoff("www.xeoaxis.com"), false);
});

test("canonical handoff URL points at leolearnstotrade handoff route", () => {
	const url = buildCanonicalHandoffUrl("ticket-123", "/lab");
	assert.equal(url, "https://leolearnstotrade.com/auth/handoff?ticket=ticket-123&next=%2Flab");
});

test("sanitizeNextPath rejects open redirects", () => {
	assert.equal(sanitizeNextPath("/my-learning"), "/my-learning");
	assert.equal(sanitizeNextPath("//evil.com"), "/my-learning");
	assert.equal(sanitizeNextPath("https://evil.com"), "/my-learning");
});
