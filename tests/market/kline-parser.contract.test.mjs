import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const testDir = dirname(fileURLToPath(import.meta.url));

async function loadTsModule(specifier) {
	const { register } = await import("node:module");
	register(join(testDir, "../lab/ts-loader.mjs"), pathToFileURL(testDir));
	return import(specifier);
}

test("tencent quote line parser reads price from qt.gtimg payload", async () => {
	const { parseTencentLine } = await loadTsModule("../../src/lib/market/tencent-provider.ts");
	const sample =
		"1~贵州茅台~600519~1306.65~1328.36~1328.36~26601~11455~15145~1306.24~1~1306.23~2";
	const parsed = parseTencentLine(sample);
	assert.ok(parsed);
	assert.equal(parsed.displaySymbol, "600519");
	assert.equal(parsed.price, 1306.65);
	assert.equal(parsed.name, "贵州茅台");
});

test("eastmoney kline row parser maps OHLCV fields", async () => {
	const { parseEastmoneyKlineRow, toEastmoneySecId } = await loadTsModule(
		"../../src/lib/market/eastmoney-provider.ts",
	);
	assert.equal(toEastmoneySecId("600519"), "1.600519");
	assert.equal(toEastmoneySecId("000001"), "0.000001");
	const row = "2026-08-05 09:31,1328.36,1328.67,1333.80,1328.00,1165,154916366.00,0.44";
	const bar = parseEastmoneyKlineRow(row);
	assert.ok(bar);
	assert.equal(bar.open, 1328.36);
	assert.equal(bar.close, 1328.67);
	assert.equal(bar.high, 1333.8);
	assert.equal(bar.low, 1328);
	assert.equal(bar.volume, 1165);
});

test("kline route validates period and delegates to eastmoney provider", () => {
	const src = readFileSync(join(root, "src/app/api/market/kline/route.ts"), "utf8");
	assert.match(src, /period 须为 1\|5\|15\|30\|60/);
	assert.match(src, /fetchEastmoneyKline/);
});
