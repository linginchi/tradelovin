export function computeDailyIncrement(baseline: number, isWeekend: boolean): number;
export function mulberry32(seed: number): () => number;
export function planSeed(videoId: string, planDate: string): number;
export function allocateHourlyIncrements(dailyTotal: number, seed: number): number[];
export function getHongKongDateTimeParts(now?: Date): {
	date: string;
	hour: number;
	weekday: string;
	isWeekend: boolean;
};
export function buildDailyGrowthPlan(input: {
	baseline: number;
	videoId: string;
	planDate: string;
	isWeekend: boolean;
}): {
	baseline: number;
	dailyIncrement: number;
	rateBps: number;
	seed: number;
	hourAllocations: number[];
};
export function dueHourSlots(asOf?: Date): number[];
