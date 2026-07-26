import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { isMissingRelationError } from "@/lib/video/db";

export const runtime = "nodejs";

type RouteContext = {
	params: Promise<{ courseId: string; videoId: string }>;
};

const patchSchema = z.object({
	marketing_view_count: z.number().int().nonnegative(),
});

const ADMIN_VIDEO_COLUMNS =
	"id, course_id, title, description, duration, sort_order, storage_key, is_free_preview, created_at, view_count, marketing_view_count";

export async function PATCH(request: Request, { params }: RouteContext) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

	const { courseId, videoId } = await params;
	if (!z.string().uuid().safeParse(courseId).success || !z.string().uuid().safeParse(videoId).success) {
		return NextResponse.json({ error: "参数无效" }, { status: 400 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "请求体无效" }, { status: 400 });
	}

	const parsed = patchSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ error: "人气值必须为非负整数" }, { status: 400 });
	}

	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ error: "服务不可用" }, { status: 503 });
	}

	const { data, error } = await srv
		.from("course_videos")
		.update({
			marketing_view_count: parsed.data.marketing_view_count,
			updated_at: new Date().toISOString(),
		})
		.eq("id", videoId)
		.eq("course_id", courseId)
		.select(ADMIN_VIDEO_COLUMNS)
		.maybeSingle();

	if (error) {
		if (isMissingRelationError(error, "course_videos")) {
			return NextResponse.json({ error: "视频表尚未创建，请先执行数据库迁移" }, { status: 503 });
		}
		const message = error.message.toLowerCase();
		if (message.includes("marketing_view_count")) {
			return NextResponse.json(
				{ error: "人气值字段尚未初始化，请先执行 marketing_view_count 数据库迁移" },
				{ status: 503 },
			);
		}
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	if (!data) {
		return NextResponse.json({ error: "视频不存在" }, { status: 404 });
	}

	return NextResponse.json({ video: data });
}
