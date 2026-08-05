import type { SupabaseClient } from "@supabase/supabase-js";

import {
	BOOSTED_MARKETING_VIDEO_ID,
	buildBoostedDailyGrowthPlan,
	buildDailyGrowthPlan,
	dueHourSlots,
	getHongKongDateTimeParts,
} from "@/lib/video/marketing-growth";

type VideoRow = {
	id: string;
	marketing_view_count: number | string | null;
};

type PlanRow = {
	video_id: string;
	plan_date: string;
	baseline_count: number | string;
	daily_increment: number | string;
	rate_bps: number;
	hour_allocations: number[] | string;
};

export type MarketingGrowthRunSummary = {
	planDate: string;
	hourSlots: number[];
	videosConsidered: number;
	plansCreated: number;
	hoursApplied: number;
	hoursSkipped: number;
	incrementTotal: number;
};

function parseAllocations(raw: PlanRow["hour_allocations"]): number[] {
	if (Array.isArray(raw)) {
		return raw.map((n) => Number(n) || 0);
	}
	if (typeof raw === "string") {
		const trimmed = raw.trim().replace(/^\{/, "").replace(/\}$/, "");
		if (!trimmed) return Array.from({ length: 24 }, () => 0);
		return trimmed.split(",").map((part) => Number(part.trim()) || 0);
	}
	return Array.from({ length: 24 }, () => 0);
}

type BuiltPlan = ReturnType<typeof buildDailyGrowthPlan>;

async function insertPlan(
	srv: SupabaseClient,
	videoId: string,
	planDate: string,
	built: BuiltPlan,
): Promise<PlanRow> {
	const insertPayload = {
		video_id: videoId,
		plan_date: planDate,
		baseline_count: built.baseline,
		daily_increment: built.dailyIncrement,
		rate_bps: built.rateBps,
		hour_allocations: built.hourAllocations,
	};

	const { data: inserted, error } = await srv
		.from("course_video_marketing_growth_plans")
		.insert(insertPayload)
		.select("video_id, plan_date, baseline_count, daily_increment, rate_bps, hour_allocations")
		.maybeSingle();

	if (!error && inserted) {
		return inserted as PlanRow;
	}

	const { data: raced, error: readError } = await srv
		.from("course_video_marketing_growth_plans")
		.select("video_id, plan_date, baseline_count, daily_increment, rate_bps, hour_allocations")
		.eq("video_id", videoId)
		.eq("plan_date", planDate)
		.maybeSingle();

	if (readError || !raced) {
		throw new Error(error?.message ?? readError?.message ?? "无法创建人气成长计划");
	}
	return raced as PlanRow;
}

async function ensurePlan(
	srv: SupabaseClient,
	video: VideoRow,
	planDate: string,
	isWeekend: boolean,
): Promise<{ plan: PlanRow; created: boolean }> {
	const { data: existing } = await srv
		.from("course_video_marketing_growth_plans")
		.select("video_id, plan_date, baseline_count, daily_increment, rate_bps, hour_allocations")
		.eq("video_id", video.id)
		.eq("plan_date", planDate)
		.maybeSingle();

	if (existing) {
		return { plan: existing as PlanRow, created: false };
	}

	const baseline = Math.max(0, Math.floor(Number(video.marketing_view_count) || 0));
	const built = buildDailyGrowthPlan({
		baseline,
		videoId: video.id,
		planDate,
		isWeekend,
	});

	const plan = await insertPlan(srv, video.id, planDate, built);
	return { plan, created: true };
}

async function ensureBoostedPlan(
	srv: SupabaseClient,
	video: VideoRow,
	planDate: string,
	isWeekend: boolean,
	maxOtherDaily: number,
): Promise<{ plan: PlanRow; created: boolean }> {
	const { data: existing } = await srv
		.from("course_video_marketing_growth_plans")
		.select("video_id, plan_date, baseline_count, daily_increment, rate_bps, hour_allocations")
		.eq("video_id", video.id)
		.eq("plan_date", planDate)
		.maybeSingle();

	if (existing) {
		return { plan: existing as PlanRow, created: false };
	}

	const baseline = Math.max(0, Math.floor(Number(video.marketing_view_count) || 0));
	const built = buildBoostedDailyGrowthPlan(
		{
			baseline,
			videoId: video.id,
			planDate,
			isWeekend,
		},
		maxOtherDaily,
	);

	const plan = await insertPlan(srv, video.id, planDate, built);
	return { plan, created: true };
}

async function applyHour(
	srv: SupabaseClient,
	videoId: string,
	planDate: string,
	hourSlot: number,
	increment: number,
): Promise<{ applied: boolean; increment: number }> {
	const { data, error } = await srv.rpc("apply_course_video_marketing_growth_hour", {
		p_video_id: videoId,
		p_plan_date: planDate,
		p_hour_slot: hourSlot,
		p_increment: increment,
	});

	if (error) {
		throw new Error(error.message || "人气成长时段套用失败");
	}

	const payload = (data ?? null) as { applied?: boolean } | null;
	return {
		applied: Boolean(payload?.applied),
		increment: Boolean(payload?.applied) ? increment : 0,
	};
}

/**
 * Ensures today's HK plan exists for every video and applies all due hour slots
 * that have not yet been recorded (catch-up safe, never double-counts).
 */
export async function runMarketingGrowthCatchUp(
	srv: SupabaseClient,
	asOf: Date = new Date(),
): Promise<MarketingGrowthRunSummary> {
	const hk = getHongKongDateTimeParts(asOf);
	const hourSlots = dueHourSlots(asOf);

	const { data: videos, error } = await srv
		.from("course_videos")
		.select("id, marketing_view_count");

	if (error) {
		throw new Error(error.message || "无法读取课程视频");
	}

	const rows = (videos ?? []) as VideoRow[];
	const planByVideoId = new Map<string, PlanRow>();
	let plansCreated = 0;

	const regularVideos = rows.filter((video) => video.id !== BOOSTED_MARKETING_VIDEO_ID);
	for (const video of regularVideos) {
		const { plan, created } = await ensurePlan(srv, video, hk.date, hk.isWeekend);
		planByVideoId.set(video.id, plan);
		if (created) plansCreated += 1;
	}

	const maxOtherDaily = Math.max(
		0,
		...Array.from(planByVideoId.values()).map((plan) => Math.floor(Number(plan.daily_increment) || 0)),
	);

	const boostedVideo = rows.find((video) => video.id === BOOSTED_MARKETING_VIDEO_ID);
	if (boostedVideo) {
		const { plan, created } = await ensureBoostedPlan(
			srv,
			boostedVideo,
			hk.date,
			hk.isWeekend,
			maxOtherDaily,
		);
		planByVideoId.set(boostedVideo.id, plan);
		if (created) plansCreated += 1;
	}

	let hoursApplied = 0;
	let hoursSkipped = 0;
	let incrementTotal = 0;

	for (const video of rows) {
		const plan = planByVideoId.get(video.id);
		if (!plan) continue;

		const allocations = parseAllocations(plan.hour_allocations);
		for (const hourSlot of hourSlots) {
			const increment = Math.max(0, Math.floor(Number(allocations[hourSlot]) || 0));
			const result = await applyHour(srv, video.id, hk.date, hourSlot, increment);
			if (result.applied) {
				hoursApplied += 1;
				incrementTotal += result.increment;
			} else {
				hoursSkipped += 1;
			}
		}
	}

	return {
		planDate: hk.date,
		hourSlots,
		videosConsidered: rows.length,
		plansCreated,
		hoursApplied,
		hoursSkipped,
		incrementTotal,
	};
}
