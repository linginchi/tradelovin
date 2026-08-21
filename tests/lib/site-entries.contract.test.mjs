// tests/lib/site-entries.contract.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {
	SITE_ENTRIES,
	CANONICAL_OVERSEAS_HOSTNAME,
	isMainlandEntryHost,
	isLegacyOverseasHost,
	isCanonicalOverseasHost,
	getMagicLinkAllowedHosts,
} from "../../src/lib/site-entries.mjs";

test("xeoaxis is mainland and never legacy_redirect", () => {
	const xeo = SITE_ENTRIES.filter((e) => e.hostname === "xeoaxis.com" || e.hostname === "www.xeoaxis.com");
	assert.equal(xeo.length, 2);
	for (const e of xeo) assert.equal(e.role, "mainland");
	assert.equal(isMainlandEntryHost("xeoaxis.com"), true);
	assert.equal(isLegacyOverseasHost("xeoaxis.com"), false);
	assert.equal(isLegacyOverseasHost("www.xeoaxis.com"), false);
});

test("tradelovin is legacy_redirect; leolearnstotrade is canonical", () => {
	assert.equal(CANONICAL_OVERSEAS_HOSTNAME, "leolearnstotrade.com");
	assert.equal(isLegacyOverseasHost("tradelovin.com"), true);
	assert.equal(isLegacyOverseasHost("www.tradelovin.com"), true);
	assert.equal(isCanonicalOverseasHost("leolearnstotrade.com"), true);
	assert.equal(isCanonicalOverseasHost("www.leolearnstotrade.com"), true);
});

test("magic-link allowlist includes all entry hosts", () => {
	const hosts = getMagicLinkAllowedHosts();
	for (const name of [
		"xeoaxis.com",
		"www.xeoaxis.com",
		"tradelovin.com",
		"www.tradelovin.com",
		"leolearnstotrade.com",
		"www.leolearnstotrade.com",
	]) {
		assert.ok(hosts.includes(name), name);
	}
});

test("magic-link allowlist does not include a Supabase custom auth hostname", () => {
	for (const host of getMagicLinkAllowedHosts()) {
		assert.equal(host.startsWith("auth."), false, host);
		assert.equal(host.endsWith(".supabase.co"), false, host);
	}
});
