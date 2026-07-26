import { NextResponse } from "next/server";
import { z } from "zod";

import { isSuperUserById } from "@/lib/auth/super-user";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";
import { isMissingRelationError } from "@/lib/video/db";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ courseId: string }>;
};

type ServiceClient = NonNullable<ReturnType<typeof getServiceSupabase>>;

type DbErrorLike = {
  code?: string;
  message?: string;
};

/** True when marketing_view_count is not deployed yet. */
function isMissingMarketingPopularityError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as DbErrorLike;
  if (e.code === "42703" || e.code === "PGRST204") return true;
  const message = (e.message ?? "").toLowerCase();
  return message.includes("marketing_view_count");
}

/**
 * Public list exposes marketing popularity only (人气/热度).
 * Real playback counters, viewer events, and growth audit tables are never selected.
 */
const BASE_COLUMNS = "id, course_id, title, description, duration, sort_order, is_free_preview";
const COLUMNS_WITH_POPULARITY = `${BASE_COLUMNS}, marketing_view_count`;

type VideoListResult = {
  videos: unknown[] | null;
  error: unknown;
  popularityAvailable: boolean;
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

/** Falls back to the pre-popularity column set when marketing_view_count is not deployed yet. */
async function listVideos(
  srv: ServiceClient,
  courseId: string,
  freePreviewOnly: boolean,
): Promise<VideoListResult> {
  const withPopularity = await queryVideos(srv, courseId, freePreviewOnly, COLUMNS_WITH_POPULARITY);
  if (!withPopularity.error) {
    return { videos: withPopularity.data ?? [], error: null, popularityAvailable: true };
  }
  if (!isMissingMarketingPopularityError(withPopularity.error)) {
    return { videos: null, error: withPopularity.error, popularityAvailable: false };
  }

  const fallback = await queryVideos(srv, courseId, freePreviewOnly, BASE_COLUMNS);
  return {
    videos: fallback.error ? null : (fallback.data ?? []),
    error: fallback.error,
    popularityAvailable: false,
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
        popularityAvailable: false,
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
      popularityAvailable: free.popularityAvailable,
    });
  }

  const isSuper = await isSuperUserById(srv, auth.userId);
  const hasAccess = isSuper || (await checkCourseAccess(srv, auth.userId, courseId));
  if (!hasAccess) {
    return NextResponse.json({
      videos: freeVideos,
      hasCourseAccess: false,
      authed: true,
      popularityAvailable: free.popularityAvailable,
    });
  }

  const all = await listVideos(srv, courseId, false);
  if (all.error) {
    if (isMissingRelationError(all.error, "course_videos")) {
      return NextResponse.json({
        videos: freeVideos,
        hasCourseAccess: false,
        authed: true,
        popularityAvailable: free.popularityAvailable,
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
    popularityAvailable: all.popularityAvailable,
  });
}
