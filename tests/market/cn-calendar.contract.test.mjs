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

test("market calendar no longer uses Hong Kong weekday heuristic for SSE", () => {
	const src = readFileSync(join(root, "src/lib/trade/market-calendar.ts"), "utf8");
	assert.doesNotMatch(src, /isWeekdayInHongKong/);
	assert.match(src, /resolveCnTradeDay/);
});

test("cn calendar provider falls back from tushare to builtin holidays", () => {
	const src = readFileSync(join(root, "src/lib/market/cn-calendar-provider.ts"), "utf8");
	assert.match(src, /fetchTradeCalendar/);
	assert.match(src, /fetchEastmoneyTradeDay/);
	assert.match(src, /resolveBuiltin/);
	assert.match(src, /TRADE_CAL_CLOSED_DATES/);
});

test("2026 spring festival is closed on SSE builtin table", async () => {
	const { isBuiltinClosedDay, isWeekdayInMarket } = await loadTsModule("../../src/lib/market/cn-holidays.ts");
	assert.equal(isBuiltinClosedDay("SSE", "20260217"), true);
	assert.equal(isWeekdayInMarket("20260218", "SSE"), true);
	assert.equal(isBuiltinClosedDay("SSE", "20260218"), true);
});

test("HKEX securities market closes for Lunar New Year on 2026-02-17 through 2026-02-19", async () => {
	const { isBuiltinClosedDay } = await loadTsModule("../../src/lib/market/cn-holidays.ts");
	for (const ymd of ["20260217", "20260218", "20260219"]) {
		assert.equal(isBuiltinClosedDay("XHKG", ymd), true, ymd);
	}
});

test("SSE stays closed on the State Council make-up work Saturday", async () => {
	const { isBuiltinClosedDay, isWeekdayInMarket } = await loadTsModule("../../src/lib/market/cn-holidays.ts");
	// 上交所公告明确 2026-02-14 为周末休市，不能按国务院上班日强制开市。
	assert.equal(isWeekdayInMarket("20260214", "SSE"), false);
	assert.equal(isBuiltinClosedDay("SSE", "20260101"), true);
});

test("SSE weekday uses Asia/Shanghai not Hong Kong", async () => {
	const { isWeekdayInMarket, marketYmd } = await loadTsModule("../../src/lib/market/cn-holidays.ts");
	assert.equal(isWeekdayInMarket("20260805", "SSE"), true);
	// 2026-08-05T17:00Z 已跨到上海次日，不能使用 UTC 的 toISOString 日期。
	assert.equal(marketYmd("SSE", new Date("2026-08-05T17:00:00Z")), "20260806");
});
