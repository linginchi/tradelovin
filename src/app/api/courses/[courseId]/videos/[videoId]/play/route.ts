import { NextResponse } from "next/server";
import { z } from "zod";

import { recordVideoView } from "@/lib/analytics/video-views";
import { isSuperUserById } from "@/lib/auth/super-user";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";
import { createSignedVideoUrl, isVideoStorageConfigured } from "@/lib/video/storage";
import { isMissingRelationError } from "@/lib/video/db";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ courseId: string; videoId: string }>;
};

type ServiceClient = NonNullable<ReturnType<typeof getServiceSupabase>>;

type VideoRow = {
  id: string;
  course_id: string;
  storage_key: string;
  is_free_preview: boolean;
};

async function hasCourseAccess(
  srv: ServiceClient,
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

async function loadVideo(
  srv: ServiceClient,
  courseId: string,
  videoId: string,
): Promise<VideoRow | NextResponse> {
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
  return video as VideoRow;
}

/**
 * Runs the existing watch authorization. Resolves to the signed-in viewer id, or
 * to null for a guest watching a free preview. Anything that is not authorized
 * to watch returns a 403 response, so no caller can count an unauthorized view.
 */
async function authorizeViewer(
  srv: ServiceClient,
  video: VideoRow,
  courseId: string,
): Promise<{ viewerId: string | null } | NextResponse> {
  const auth = await requireTradeUser();
  const viewerId = auth instanceof NextResponse ? null : auth.userId;

  if (video.is_free_preview) {
    return { viewerId };
  }

  if (!viewerId) {
    return NextResponse.json({ error: "无权限观看，请先购买课程" }, { status: 403 });
  }

  const isSuper = await isSuperUserById(srv, viewerId);
  if (!isSuper) {
    const allowed = await hasCourseAccess(srv, viewerId, courseId);
    if (!allowed) {
      return NextResponse.json({ error: "无权限观看，请先购买课程" }, { status: 403 });
    }
  }

  return { viewerId };
}

function parseIds(courseId: string, videoId: string): NextResponse | null {
  if (!z.string().uuid().safeParse(courseId).success || !z.string().uuid().safeParse(videoId).success) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }
  return null;
}

/** Issues a playback URL. Requesting a URL is not playback, so it never counts. */
export async function GET(_request: Request, { params }: RouteContext) {
  const { courseId, videoId } = await params;
  const invalid = parseIds(courseId, videoId);
  if (invalid) return invalid;

  if (!isVideoStorageConfigured()) {
    return NextResponse.json({ error: "视频服务暂未配置" }, { status: 503 });
  }

  const srv = getServiceSupabase();
  if (!srv) {
    return NextResponse.json({ error: "服务不可用" }, { status: 503 });
  }

  const video = await loadVideo(srv, courseId, videoId);
  if (video instanceof NextResponse) return video;

  const viewer = await authorizeViewer(srv, video, courseId);
  if (viewer instanceof NextResponse) return viewer;

  const playUrl = await createSignedVideoUrl(String(video.storage_key), 15 * 60);
  if (!playUrl) {
    return NextResponse.json({ error: "播放地址生成失败" }, { status: 500 });
  }
  return NextResponse.json({ playUrl, expiresIn: 15 * 60 });
}

/**
 * Records one view event for playback the client actually started.
 *
 * Counting happens only after the same authorization the GET handler applies,
 * and only for a signed-in viewer, so guests previewing a free video and any
 * unauthorized or unknown video never move the counter.
 */
export async function POST(_request: Request, { params }: RouteContext) {
  const { courseId, videoId } = await params;
  const invalid = parseIds(courseId, videoId);
  if (invalid) return invalid;

  const srv = getServiceSupabase();
  if (!srv) {
    return NextResponse.json({ error: "服务不可用" }, { status: 503 });
  }

  const video = await loadVideo(srv, courseId, videoId);
  if (video instanceof NextResponse) return video;

  const viewer = await authorizeViewer(srv, video, courseId);
  if (viewer instanceof NextResponse) return viewer;

  if (!viewer.viewerId) {
    return NextResponse.json({ counted: false, viewCount: null });
  }

  const result = await recordVideoView(srv, { videoId, userId: viewer.viewerId });
  if (result.degraded) {
    return NextResponse.json({
      counted: false,
      viewCount: null,
      warning: "观看计数尚未初始化，请先执行数据库迁移（course_videos.view_count）。",
    });
  }

  return NextResponse.json({ counted: result.counted, viewCount: result.viewCount });
}
