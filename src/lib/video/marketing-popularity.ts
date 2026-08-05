/** Compact popularity label shared across zh / zh-TW / en. */
export function formatMarketingViewCount(count: number): string {
	const n = Math.max(0, Math.floor(Number(count) || 0));
	if (n >= 10_000) {
		const wan = n / 10_000;
		const text = Number.isInteger(wan) ? String(wan) : wan.toFixed(1);
		return `${text}万`;
	}
	if (n >= 1_000) {
		const k = n / 1_000;
		const text = Number.isInteger(k) ? String(k) : k.toFixed(1);
		return `${text}K`;
	}
	return String(n);
}

/** Keep in sync with marketing-growth.mjs BOOSTED_MARKETING_VIDEO_ID. */
export const BOOSTED_MARKETING_VIDEO_ID = "7e742344-5a40-471e-b2ea-53e8553702df";
export const BOOSTED_MARKETING_INCREMENT_MULT = 1.2;
export const BOOSTED_MARKETING_BASELINE = 3589;

export const MARKETING_VIEW_COUNT_FLOORS = {
	classic: 1800,
	recorded: 1200,
	default: 800,
} as const;

/** Topic sort_order for video-hub partitions (see hub-topics). */
export function marketingViewCountFloorForTopicSort(sortOrder: number | null | undefined): number {
	if (sortOrder === 10) return MARKETING_VIEW_COUNT_FLOORS.classic;
	if (sortOrder === 20) return MARKETING_VIEW_COUNT_FLOORS.recorded;
	return MARKETING_VIEW_COUNT_FLOORS.default;
}

/** Read-only seed helper — mirrors supabase/seed SQL, not executed at runtime. */
export function computeMarketingViewCountSeed(
	viewCount: number,
	topicSortOrder: number | null | undefined,
	videoId: string,
): number {
	if (videoId === BOOSTED_MARKETING_VIDEO_ID) return BOOSTED_MARKETING_BASELINE;
	const floor = marketingViewCountFloorForTopicSort(topicSortOrder);
	return Math.max(Math.max(0, Math.floor(viewCount)), floor);
}
