import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { isMissingRelationError } from "@/lib/video/db";
import { createSignedVideoUrl, objectStoreMissingFor } from "@/lib/video/storage";

export const runtime = "nodejs";

type RouteContext = {
	params: Promise<{ courseId: string; videoId: string }>;
};

/** Admin-only signed play URL — works for draft / scheduled clips. */
export async function GET(_request: Request, { params }: RouteContext) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

	const { courseId, videoId } = await params;
	if (!z.string().uuid().safeParse(courseId).success || !z.string().uuid().safeParse(videoId).success) {
		return NextResponse.json({ error: "参数无效" }, { status: 400 });
	}

	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ error: "服务不可用" }, { status: 503 });
	}

	const { data: video, error } = await srv
		.from("course_videos")
		.select("id, course_id, storage_key, published_at")
		.eq("id", videoId)
		.eq("course_id", courseId)
		.maybeSingle();

	if (error) {
		if (isMissingRelationError(error, "course_videos")) {
			return NextResponse.json({ error: "视频表尚未创建" }, { status: 503 });
		}
		// published_at may be missing pre-migration — retry without it
		if (/published_at/i.test(error.message)) {
			const fallback = await srv
				.from("course_videos")
				.select("id, course_id, storage_key")
				.eq("id", videoId)
				.eq("course_id", courseId)
				.maybeSingle();
			if (fallback.error) {
				return NextResponse.json({ error: fallback.error.message }, { status: 500 });
			}
			if (!fallback.data) {
				return NextResponse.json({ error: "视频不存在" }, { status: 404 });
			}
			if (objectStoreMissingFor(String(fallback.data.storage_key))) {
				return NextResponse.json({ error: "视频服务暂未配置" }, { status: 503 });
			}
			const playUrl = await createSignedVideoUrl(String(fallback.data.storage_key), 15 * 60);
			if (!playUrl) {
				return NextResponse.json({ error: "播放地址生成失败" }, { status: 500 });
			}
			return NextResponse.json({ playUrl, expiresIn: 15 * 60, published_at: null });
		}
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	if (!video) {
		return NextResponse.json({ error: "视频不存在" }, { status: 404 });
	}

	if (objectStoreMissingFor(String(video.storage_key))) {
		return NextResponse.json({ error: "视频服务暂未配置" }, { status: 503 });
	}

	const playUrl = await createSignedVideoUrl(String(video.storage_key), 15 * 60);
	if (!playUrl) {
		return NextResponse.json({ error: "播放地址生成失败" }, { status: 500 });
	}

	return NextResponse.json({
		playUrl,
		expiresIn: 15 * 60,
		published_at: (video.published_at as string | null) ?? null,
	});
}
