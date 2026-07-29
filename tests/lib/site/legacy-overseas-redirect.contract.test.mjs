import assert from "node:assert/strict";
import test from "node:test";
import { buildLegacyOverseasRedirectUrl } from "../../../src/lib/site/legacy-overseas-redirect.mjs";

test("tradelovin redirects to leolearnstotrade preserving path and query", () => {
	const url = buildLegacyOverseasRedirectUrl({
		hostname: "tradelovin.com",
		href: "https://tradelovin.com/lab?x=1",
	});
	assert.equal(url, "https://leolearnstotrade.com/lab?x=1");
});

test("xeoaxis never redirects", () => {
	assert.equal(
		buildLegacyOverseasRedirectUrl({ hostname: "xeoaxis.com", href: "https://xeoaxis.com/" }),
		null,
	);
	assert.equal(
		buildLegacyOverseasRedirectUrl({ hostname: "www.xeoaxis.com", href: "https://www.xeoaxis.com/login" }),
		null,
	);
});

test("canonical host does not redirect", () => {
	assert.equal(
		buildLegacyOverseasRedirectUrl({
			hostname: "leolearnstotrade.com",
			href: "https://leolearnstotrade.com/",
		}),
		null,
	);
});
