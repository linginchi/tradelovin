/**
 * Deterministic marketing-popularity growth math.
 * Asia/Hong_Kong calendar; deterministic PRNG only; safe to retry.
 */

import { createHash } from "node:crypto";

/** @param {number} baseline @param {boolean} isWeekend */
export function computeDailyIncrement(baseline, isWeekend) {
	const n = Number(baseline);
	if (!Number.isFinite(n) || n <= 0) return 0;
	const rate = isWeekend ? 0.02 : 0.01;
	return Math.round(n * rate);
}

/** Mulberry32 — deterministic PRNG from a 32-bit seed. */
export function mulberry32(seed) {
	let a = seed >>> 0;
	return function next() {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** @param {string} videoId @param {string} planDate YYYY-MM-DD (HK) */
export function planSeed(videoId, planDate) {
	const digest = createHash("sha256").update(`${videoId}|${planDate}`).digest();
	return digest.readUInt32BE(0);
}

/**
 * Split a non-negative integer across 24 hours (largest remainder).
 * Same seed always yields the same allocation; sum equals dailyTotal.
 * @param {number} dailyTotal
 * @param {number} seed
 * @returns {number[]}
 */
export function allocateHourlyIncrements(dailyTotal, seed) {
	const total = Math.max(0, Math.floor(Number(dailyTotal) || 0));
	if (total === 0) return Array.from({ length: 24 }, () => 0);

	const rand = mulberry32(seed >>> 0);
	const weights = Array.from({ length: 24 }, () => rand() + 1e-9);
	const weightSum = weights.reduce((a, b) => a + b, 0);
	const raw = weights.map((w) => (w / weightSum) * total);
	const floors = raw.map((x) => Math.floor(x));
	let remainder = total - floors.reduce((a, b) => a + b, 0);
	const order = raw
		.map((x, i) => ({ i, frac: x - floors[i] }))
		.sort((a, b) => b.frac - a.frac || a.i - b.i);
	for (let k = 0; k < remainder; k += 1) {
		floors[order[k].i] += 1;
	}
	return floors;
}

/**
 * @param {Date} [now]
 * @returns {{ date: string, hour: number, weekday: string, isWeekend: boolean }}
 */
export function getHongKongDateTimeParts(now = new Date()) {
	const dtf = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Hong_Kong",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		hour12: false,
		weekday: "short",
	});
	const parts = dtf.formatToParts(now);
	const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
	const weekday = get("weekday");
	let hour = Number(get("hour") || 0);
	// en-CA hour12:false can emit "24" for midnight in some engines.
	if (hour === 24) hour = 0;
	return {
		date: `${get("year")}-${get("month")}-${get("day")}`,
		hour,
		weekday,
		isWeekend: weekday === "Sat" || weekday === "Sun",
	};
}

/**
 * @param {{ baseline: number, videoId: string, planDate: string, isWeekend: boolean }} input
 */
export function buildDailyGrowthPlan(input) {
	const baseline = Math.max(0, Math.floor(Number(input.baseline) || 0));
	const dailyIncrement = computeDailyIncrement(baseline, input.isWeekend);
	const seed = planSeed(input.videoId, input.planDate);
	const hourAllocations = allocateHourlyIncrements(dailyIncrement, seed);
	return {
		baseline,
		dailyIncrement,
		rateBps: input.isWeekend ? 200 : 100,
		seed,
		hourAllocations,
	};
}

/**
 * Hours that should already have been applied by `asOf` on the HK calendar day.
 * Includes the current hour (hourly cron applies when the hour has started).
 * @param {Date} [asOf]
 * @returns {number[]}
 */
export function dueHourSlots(asOf = new Date()) {
	const { hour } = getHongKongDateTimeParts(asOf);
	const capped = Math.max(0, Math.min(23, hour));
	return Array.from({ length: capped + 1 }, (_, i) => i);
}
