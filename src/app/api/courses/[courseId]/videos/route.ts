import { NextResponse } from "next/server";
import { z } from "zod";

import { isMissingViewCounterError } from "@/lib/analytics/video-views";
import { isSuperUserById } from "@/lib/auth/super-user";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";
import { isMissingRelationError } from "@/lib/video/db";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ courseId: string }>;
};

type ServiceClient = NonNullable<ReturnType<typeof getServiceSupabase>>;

/**
 * view_count is the only view-derived field exposed here. Viewer identities and
 * per-viewer events are never selected, so the list cannot leak who watched.
 */
const BASE_COLUMNS = "id, course_id, title, description, duration, sort_order, is_free_preview";
const COLUMNS_WITH_VIEW_COUNT = `${BASE_COLUMNS}, view_count`;

type VideoListResult = {
  videos: unknown[] | null;
  error: unknown;
  viewCountsAvailable: boolean;
};

async function checkCourseAccess(
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

async function queryVideos(
  srv: ServiceClient,
  courseId: string,
  freePreviewOnly: boolean,
  columns: string,
) {
  const base = srv.from("course_videos").select(columns).eq("course_id", courseId);
  const filtered = freePreviewOnly ? base.eq("is_free_preview", true) : base;
  return filtered.order("sort_order", { ascending: true }).order("created_at", { ascending: true });
}

/** Falls back to the pre-counter column set when view_count is not deployed yet. */
async function listVideos(
  srv: ServiceClient,
  courseId: string,
  freePreviewOnly: boolean,
): Promise<VideoListResult> {
  const withCounts = await queryVideos(srv, courseId, freePreviewOnly, COLUMNS_WITH_VIEW_COUNT);
  if (!withCounts.error) {
    return { videos: withCounts.data ?? [], error: null, viewCountsAvailable: true };
  }
  if (!isMissingViewCounterError(withCounts.error)) {
    return { videos: null, error: withCounts.error, viewCountsAvailable: false };
  }

  const fallback = await queryVideos(srv, courseId, freePreviewOnly, BASE_COLUMNS);
  return {
    videos: fallback.error ? null : (fallback.data ?? []),
    error: fallback.error,
    viewCountsAvailable: false,
  };
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { courseId } = await params;
  if (!z.string().uuid().safeParse(courseId).success) {
    return NextResponse.json({ error: "课程 ID 无效" }, { status: 400 });
  }

  const srv = getServiceSupabase();
  if (!srv) {
    return NextResponse.json({ error: "服务不可用" }, { status: 503 });
  }

  const free = await listVideos(srv, courseId, true);
  if (free.error) {
    if (isMissingRelationError(free.error, "course_videos")) {
      return NextResponse.json({
        videos: [],
        hasCourseAccess: false,
        authed: false,
        viewCountsAvailable: false,
        warning: "视频表尚未初始化，请先执行数据库迁移（course_videos）。",
      });
    }
    const message = (free.error as { message?: string }).message ?? "查询失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  const freeVideos = free.videos ?? [];

  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) {
    return NextResponse.json({
      videos: freeVideos,
      hasCourseAccess: false,
      authed: false,
      viewCountsAvailable: free.viewCountsAvailable,
    });
  }

  const isSuper = await isSuperUserById(srv, auth.userId);
  const hasAccess = isSuper || (await checkCourseAccess(srv, auth.userId, courseId));
  if (!hasAccess) {
    return NextResponse.json({
      videos: freeVideos,
      hasCourseAccess: false,
      authed: true,
      viewCountsAvailable: free.viewCountsAvailable,
    });
  }

  const all = await listVideos(srv, courseId, false);
  if (all.error) {
    if (isMissingRelationError(all.error, "course_videos")) {
      return NextResponse.json({
        videos: freeVideos,
        hasCourseAccess: false,
        authed: true,
        viewCountsAvailable: free.viewCountsAvailable,
        warning: "视频表尚未初始化，请先执行数据库迁移（course_videos）。",
      });
    }
    const message = (all.error as { message?: string }).message ?? "查询失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({
    videos: all.videos ?? [],
    hasCourseAccess: true,
    authed: true,
    viewCountsAvailable: all.viewCountsAvailable,
  });
}
