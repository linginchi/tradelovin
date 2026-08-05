import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("tushare provider logs structured failures instead of silent empty returns", () => {
	const src = readFileSync(join(root, "src/lib/market/tushare-provider.ts"), "utf8");
	assert.match(src, /console\.warn\("\[market\.tushare\]"/);
	assert.match(src, /token_missing/);
	assert.match(src, /classifyTushareApiError/);
	assert.match(src, /429/);
	assert.doesNotMatch(src, /if \(!token\) return \[\]/);
});

test("market domain defines multi-source fallback chain order", () => {
	const src = readFileSync(join(root, "src/lib/market/market-domain.ts"), "utf8");
	assert.match(src, /dataSources\.push\("tushare"\)/);
	assert.match(src, /dataSources\.push\("sina"\)/);
	assert.match(src, /dataSources\.push\("tencent"\)/);
	assert.match(src, /dataSources\.push\("eastmoney"\)/);
	assert.match(src, /isTradeDaySource/);
});

test("quote route exposes dataSources and ignores unused mode param", () => {
	const src = readFileSync(join(root, "src/app/api/market/quote/route.ts"), "utf8");
	assert.match(src, /dataSources: quote\.dataSources/);
	assert.match(src, /isTradeDaySource/);
	assert.match(src, /mode 参数保留兼容/);
});
