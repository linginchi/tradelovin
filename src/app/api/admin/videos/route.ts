import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { isMissingRelationError } from "@/lib/video/db";
import { isMissingPublishedAtError, resolvePublishStatus } from "@/lib/video/publish-status";

export const runtime = "nodejs";

const statusSchema = z.enum(["all", "draft", "scheduled", "live"]).default("all");

const COLUMNS =
	"id, course_id, title, description, duration, sort_order, storage_key, is_free_preview, created_at, published_at, view_count, marketing_view_count";
const COLUMNS_NO_POP =
	"id, course_id, title, description, duration, sort_order, storage_key, is_free_preview, created_at, published_at";
const COLUMNS_LEGACY =
	"id, course_id, title, description, duration, sort_order, storage_key, is_free_preview, created_at";

type VideoRow = {
	id: string;
	course_id: string;
	title: string;
	description: string | null;
	duration: number | null;
	sort_order: number;
	storage_key: string;
	is_free_preview: boolean;
	created_at: string;
	published_at?: string | null;
	view_count?: number | null;
	marketing_view_count?: number | null;
};

/**
 * Admin publish desk list. Filters by draft / scheduled / live in app code
 * so we can still return rows when published_at is not migrated yet.
 */
export async function GET(request: Request) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

	const url = new URL(request.url);
	const statusParsed = statusSchema.safeParse(url.searchParams.get("status") ?? "all");
	const status = statusParsed.success ? statusParsed.data : "all";

	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ error: "服务不可用" }, { status: 503 });
	}

	let rows: VideoRow[] | null = null;
	let error: { message: string } | null = null;
	let publishedAtAvailable = true;

	const primary = await srv
		.from("course_videos")
		.select(COLUMNS)
		.order("created_at", { ascending: false })
		.limit(500);

	if (!primary.error) {
		rows = (primary.data ?? []) as VideoRow[];
	} else if (isMissingPublishedAtError(primary.error) || /published_at/i.test(primary.error.message)) {
		publishedAtAvailable = false;
		const legacy = await srv
			.from("course_videos")
			.select(COLUMNS_LEGACY)
			.order("created_at", { ascending: false })
			.limit(500);
		rows = (legacy.data ?? []) as VideoRow[];
		error = legacy.error;
	} else if (/view_count|marketing_view_count/i.test(primary.error.message)) {
		const mid = await srv
			.from("course_videos")
			.select(COLUMNS_NO_POP)
			.order("created_at", { ascending: false })
			.limit(500);
		if (!mid.error) {
			rows = (mid.data ?? []) as VideoRow[];
		} else if (isMissingPublishedAtError(mid.error) || /published_at/i.test(mid.error.message)) {
			publishedAtAvailable = false;
			const legacy = await srv
				.from("course_videos")
				.select(COLUMNS_LEGACY)
				.order("created_at", { ascending: false })
				.limit(500);
			rows = (legacy.data ?? []) as VideoRow[];
			error = legacy.error;
		} else {
			error = mid.error;
		}
	} else {
		error = primary.error;
	}

	if (error) {
		if (isMissingRelationError(error, "course_videos")) {
			return NextResponse.json(
				{ error: "视频表尚未创建，请先执行数据库迁移（course_videos）" },
				{ status: 503 },
			);
		}
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	const now = new Date();
	const courseIds = [...new Set((rows ?? []).map((v) => v.course_id))];
	const courseTitleMap = new Map<string, string>();
	if (courseIds.length > 0) {
		const { data: courses } = await srv.from("courses").select("id, title").in("id", courseIds);
		for (const c of courses ?? []) {
			courseTitleMap.set(c.id as string, (c.title as string) || "—");
		}
	}

	const enriched = (rows ?? []).map((v) => {
		const publishedAt = publishedAtAvailable ? (v.published_at ?? null) : v.created_at;
		return {
			...v,
			published_at: publishedAtAvailable ? (v.published_at ?? null) : null,
			publish_status: resolvePublishStatus(
				publishedAtAvailable ? (v.published_at ?? null) : v.created_at,
				now,
			),
			course_title: courseTitleMap.get(v.course_id) ?? "—",
		};
	});

	const filtered =
		status === "all" ? enriched : enriched.filter((v) => v.publish_status === status);

	return NextResponse.json({
		videos: filtered,
		publishedAtAvailable,
	});
}
