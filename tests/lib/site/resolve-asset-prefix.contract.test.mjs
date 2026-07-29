// tests/lib/site/resolve-asset-prefix.contract.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { resolveAssetPrefix } from "../../../src/lib/site/resolve-asset-prefix.mjs";

test("empty env yields undefined", () => {
	assert.equal(resolveAssetPrefix({}), undefined);
	assert.equal(resolveAssetPrefix({ NEXT_ASSET_PREFIX: "  " }), undefined);
});

test("ignores workers.dev absolute prefix", () => {
	assert.equal(resolveAssetPrefix({ NEXT_ASSET_PREFIX: "https://tradelovin.mark-377.workers.dev" }), undefined);
});

test("ignores absolute site-domain prefixes under multi-entry", () => {
	assert.equal(resolveAssetPrefix({ NEXT_ASSET_PREFIX: "https://leolearnstotrade.com" }), undefined);
	assert.equal(resolveAssetPrefix({ NEXT_ASSET_PREFIX: "https://xeoaxis.com" }), undefined);
	assert.equal(resolveAssetPrefix({ ASSET_PREFIX: "https://tradelovin.com/_next" }), undefined);
});

test("ignores protocol-relative prefixes under multi-entry", () => {
	assert.equal(resolveAssetPrefix({ NEXT_ASSET_PREFIX: "//leolearnstotrade.com/_next" }), undefined);
});

test("allows relative prefix without scheme", () => {
	assert.equal(resolveAssetPrefix({ NEXT_ASSET_PREFIX: "/cdn" }), "/cdn");
});
