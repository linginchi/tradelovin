import assert from "node:assert/strict";
import test from "node:test";

import {
	allocateHourlyIncrements,
	buildDailyGrowthPlan,
	computeDailyIncrement,
	dueHourSlots,
	getHongKongDateTimeParts,
	planSeed,
} from "../../../src/lib/video/marketing-growth.mjs";

test("weekday grows 1%, weekend 2%, zero baseline stays flat", () => {
	assert.equal(computeDailyIncrement(0, false), 0);
	assert.equal(computeDailyIncrement(0, true), 0);
	assert.equal(computeDailyIncrement(100, false), 1);
	assert.equal(computeDailyIncrement(100, true), 2);
	assert.equal(computeDailyIncrement(150, false), 2); // Math.round(1.5)
	assert.equal(computeDailyIncrement(149, false), 1); // Math.round(1.49)
	assert.equal(computeDailyIncrement(25, true), 1); // Math.round(0.5)
});

test("24-hour allocation sums to daily total and is reproducible", () => {
	const videoId = "11111111-1111-4111-8111-111111111111";
	const planDate = "2026-07-25";
	const seed = planSeed(videoId, planDate);
	const a = allocateHourlyIncrements(47, seed);
	const b = allocateHourlyIncrements(47, seed);
	assert.equal(a.length, 24);
	assert.deepEqual(a, b);
	assert.equal(
		a.reduce((sum, n) => sum + n, 0),
		47,
	);
	assert.ok(a.every((n) => Number.isInteger(n) && n >= 0));

	const zero = allocateHourlyIncrements(0, seed);
	assert.deepEqual(zero, Array.from({ length: 24 }, () => 0));

	const other = allocateHourlyIncrements(47, planSeed(videoId, "2026-07-26"));
	assert.notDeepEqual(a, other);
});

test("buildDailyGrowthPlan is stable across retries", () => {
	const input = {
		baseline: 1000,
		videoId: "22222222-2222-4222-8222-222222222222",
		planDate: "2026-07-26",
		isWeekend: true,
	};
	const first = buildDailyGrowthPlan(input);
	const second = buildDailyGrowthPlan(input);
	assert.deepEqual(first, second);
	assert.equal(first.dailyIncrement, 20);
	assert.equal(first.rateBps, 200);
	assert.equal(
		first.hourAllocations.reduce((s, n) => s + n, 0),
		first.dailyIncrement,
	);
});

test("dueHourSlots catch-up covers elapsed HK hours without going past 23", () => {
	// 2026-07-26 15:30 UTC = 2026-07-26 23:30 HKT
	const late = dueHourSlots(new Date("2026-07-26T15:30:00.000Z"));
	assert.equal(late.length, 24);
	assert.equal(late[0], 0);
	assert.equal(late[23], 23);

	// 2026-07-26 00:30 UTC = 2026-07-26 08:30 HKT
	const morning = dueHourSlots(new Date("2026-07-26T00:30:00.000Z"));
	assert.deepEqual(morning, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test("Hong Kong weekend detection uses Asia/Hong_Kong", () => {
	// Sunday 2026-07-26 01:00 UTC = 09:00 HKT Sunday
	const sun = getHongKongDateTimeParts(new Date("2026-07-26T01:00:00.000Z"));
	assert.equal(sun.date, "2026-07-26");
	assert.equal(sun.isWeekend, true);

	// Friday 2026-07-24 08:00 UTC = 16:00 HKT Friday
	const fri = getHongKongDateTimeParts(new Date("2026-07-24T08:00:00.000Z"));
	assert.equal(fri.date, "2026-07-24");
	assert.equal(fri.isWeekend, false);
	assert.equal(fri.hour, 16);
});
