/**
 * Typed re-exports for the deterministic marketing-popularity growth math.
 * Implementation lives in marketing-growth.mjs so Node contract tests can import it.
 */

export {
	allocateHourlyIncrements,
	BOOSTED_MARKETING_INCREMENT_MULT,
	BOOSTED_MARKETING_VIDEO_ID,
	buildBoostedDailyGrowthPlan,
	buildDailyGrowthPlan,
	computeBoostedDailyIncrement,
	computeDailyIncrement,
	dueHourSlots,
	getHongKongDateTimeParts,
	mulberry32,
	planSeed,
} from "./marketing-growth.mjs";

export type HongKongDateTimeParts = {
	date: string;
	hour: number;
	weekday: string;
	isWeekend: boolean;
};

export type DailyGrowthPlan = {
	baseline: number;
	dailyIncrement: number;
	rateBps: number;
	seed: number;
	hourAllocations: number[];
};
