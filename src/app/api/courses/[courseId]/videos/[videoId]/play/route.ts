import { NextResponse } from "next/server";
import { z } from "zod";

import { isSuperUserById } from "@/lib/auth/super-user";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";
import { createSignedVideoUrl, isVideoStorageConfigured } from "@/lib/video/storage";
import { isMissingRelationError, isMissingVideoViewCounterError } from "@/lib/video/db";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ courseId: string; videoId: string }>;
};

async function hasCourseAccess(
  srv: NonNullable<ReturnType<typeof getServiceSupabase>>,
  userId: string,
  courseId: string,
): Promise<boolean> {
  const { data } = await srv
    .from("course_registrations")
    .select("id,status")
    .eq("course_id", courseId)
    .eq("user_id", userId)
    .in("status", ["approved", "paid"])
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { courseId, videoId } = await params;
  if (!z.string().uuid().safeParse(courseId).success || !z.string().uuid().safeParse(videoId).success) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }
  if (!isVideoStorageConfigured()) {
    return NextResponse.json({ error: "视频服务暂未配置" }, { status: 503 });
  }

  const srv = getServiceSupabase();
  if (!srv) {
    return NextResponse.json({ error: "服务不可用" }, { status: 503 });
  }

  const { data: video, error: videoErr } = await srv
    .from("course_videos")
    .select("id, course_id, storage_key, is_free_preview")
    .eq("id", videoId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (videoErr) {
    if (isMissingRelationError(videoErr, "course_videos")) {
      return NextResponse.json(
        { error: "视频功能尚未初始化，请先执行数据库迁移（course_videos）。" },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: videoErr.message }, { status: 500 });
  }
  if (!video) {
    return NextResponse.json({ error: "视频不存在" }, { status: 404 });
  }

  if (!video.is_free_preview) {
    const auth = await requireTradeUser();
    if (auth instanceof NextResponse) {
      return NextResponse.json({ error: "无权限观看，请先购买课程" }, { status: 403 });
    }
    const isSuper = await isSuperUserById(srv, auth.userId);
    if (!isSuper) {
      const allowed = await hasCourseAccess(srv, auth.userId, courseId);
      if (!allowed) {
        return NextResponse.json({ error: "无权限观看，请先购买课程" }, { status: 403 });
      }
    }
  }

  const playUrl = await createSignedVideoUrl(String(video.storage_key), 15 * 60);
  if (!playUrl) {
    return NextResponse.json({ error: "播放地址生成失败" }, { status: 500 });
  }

  const { data: viewCount, error: viewErr } = await srv.rpc("increment_course_video_view_count", {
    p_video_id: videoId,
  });
  if (viewErr && !isMissingVideoViewCounterError(viewErr)) {
    return NextResponse.json({ error: viewErr.message }, { status: 500 });
  }

  return NextResponse.json({
    playUrl,
    expiresIn: 15 * 60,
    viewCount: viewCount == null ? undefined : Number(viewCount),
    warning: viewErr ? "观看计数器尚未初始化，请先执行数据库迁移。" : undefined,
  });
}
