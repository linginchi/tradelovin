import assert from "node:assert/strict";
import test from "node:test";

import { resolveMagicLinkBaseUrl } from "../../../src/lib/auth/magic-link-origin.mjs";

test("mainland xeoaxis request keeps magic-link origin on xeoaxis even when env points overseas", () => {
	const base = resolveMagicLinkBaseUrl({
		requestUrl: "https://tradelovin.mark-377.workers.dev/api/auth/send-login-link",
		originHeader: "https://xeoaxis.com",
		forwardedHost: "xeoaxis.com",
		hostHeader: "tradelovin.mark-377.workers.dev",
		envOrigin: "https://leolearnstotrade.com",
	});
	assert.equal(base, "https://xeoaxis.com");
});

test("www.xeoaxis.com is allowlisted", () => {
	const base = resolveMagicLinkBaseUrl({
		requestUrl: "https://example.invalid/api/auth/send-login-link",
		hostHeader: "www.xeoaxis.com",
		envOrigin: "https://leolearnstotrade.com",
	});
	assert.equal(base, "https://www.xeoaxis.com");
});

test("falls back to env origin when request host is not allowlisted", () => {
	const base = resolveMagicLinkBaseUrl({
		requestUrl: "https://tradelovin.mark-377.workers.dev/api/auth/send-login-link",
		hostHeader: "tradelovin.mark-377.workers.dev",
		envOrigin: "https://leolearnstotrade.com",
	});
	assert.equal(base, "https://leolearnstotrade.com");
});

test("falls back to xeoaxis when env missing and request host unknown", () => {
	const base = resolveMagicLinkBaseUrl({
		requestUrl: "https://tradelovin.mark-377.workers.dev/api/auth/send-login-link",
		hostHeader: "tradelovin.mark-377.workers.dev",
		envOrigin: "",
	});
	assert.equal(base, "https://xeoaxis.com");
});

test("allowlist stays in sync with site-entries", async () => {
	const { getMagicLinkAllowedHosts } = await import("../../../src/lib/site-entries.mjs");
	const { isAllowedMagicLinkHost } = await import("../../../src/lib/auth/magic-link-origin.mjs");
	for (const host of getMagicLinkAllowedHosts()) {
		assert.equal(isAllowedMagicLinkHost(host), true);
	}
});
