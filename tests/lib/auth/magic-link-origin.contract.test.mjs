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

test("xeoaxis magic-link origin ignores a future Supabase custom auth domain in env", async () => {
	const { isAllowedMagicLinkHost, resolveMagicLinkBaseUrl } = await import(
		"../../../src/lib/auth/magic-link-origin.mjs"
	);
	assert.equal(isAllowedMagicLinkHost("auth.leolearnstotrade.com"), false);
	assert.equal(isAllowedMagicLinkHost("auth.xeoaxis.com"), false);
	assert.equal(isAllowedMagicLinkHost("bpuqqyqmrtchaqfouygm.supabase.co"), false);
	const base = resolveMagicLinkBaseUrl({
		requestUrl: "https://xeoaxis.com/api/auth/send-login-link",
		originHeader: "https://xeoaxis.com",
		hostHeader: "xeoaxis.com",
		envOrigin: "https://auth.leolearnstotrade.com",
	});
	assert.equal(base, "https://xeoaxis.com");
});

test("login emails are built from Host origin, not NEXT_PUBLIC_SUPABASE_URL", async () => {
	const { readFileSync } = await import("node:fs");
	const { dirname, join } = await import("node:path");
	const { fileURLToPath } = await import("node:url");
	const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
	const send = readFileSync(join(root, "src/app/api/auth/send-login-link/route.ts"), "utf8");
	assert.match(send, /resolveMagicLinkBaseUrl/);
	assert.match(send, /\/auth\/magic-link\?token=/);
	assert.doesNotMatch(send, /NEXT_PUBLIC_SUPABASE_URL/);
	const proxy = readFileSync(join(root, "src/app/api/supabase-proxy/[[...path]]/route.ts"), "utf8");
	assert.match(proxy, /bpuqqyqmrtchaqfouygm\.supabase\.co/);
});
