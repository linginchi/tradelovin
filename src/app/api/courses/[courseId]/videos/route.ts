import { NextResponse } from "next/server";
import { z } from "zod";

import { isSuperUserById } from "@/lib/auth/super-user";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";
import { isMissingRelationError, isMissingVideoViewCounterError } from "@/lib/video/db";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ courseId: string }>;
};

type VideoListResult = {
  videos: Record<string, unknown>[];
  missingViewCounter: boolean;
  missingRelation: boolean;
  error?: string;
};

async function checkCourseAccess(
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

async function listCourseVideos(
  srv: NonNullable<ReturnType<typeof getServiceSupabase>>,
  courseId: string,
  freePreviewOnly: boolean,
): Promise<VideoListResult> {
  let query = srv
    .from("course_videos")
    .select("id, course_id, title, description, duration, sort_order, is_free_preview, view_count")
    .eq("course_id", courseId);
  if (freePreviewOnly) {
    query = query.eq("is_free_preview", true);
  }

  const { data, error } = await query.order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (!error) {
    return {
      videos: (data ?? []) as Record<string, unknown>[],
      missingViewCounter: false,
      missingRelation: false,
    };
  }
  if (isMissingRelationError(error, "course_videos")) {
    return { videos: [], missingViewCounter: false, missingRelation: true };
  }
  if (!isMissingVideoViewCounterError(error)) {
    return { videos: [], missingViewCounter: false, missingRelation: false, error: error.message };
  }

  let fallbackQuery = srv
    .from("course_videos")
    .select("id, course_id, title, description, duration, sort_order, is_free_preview")
    .eq("course_id", courseId);
  if (freePreviewOnly) {
    fallbackQuery = fallbackQuery.eq("is_free_preview", true);
  }

  const { data: fallbackData, error: fallbackError } = await fallbackQuery
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (fallbackError) {
    return { videos: [], missingViewCounter: true, missingRelation: false, error: fallbackError.message };
  }

  return {
    videos: ((fallbackData ?? []) as Record<string, unknown>[]).map((video) => ({ ...video, view_count: 0 })),
    missingViewCounter: true,
    missingRelation: false,
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

  const freeResult = await listCourseVideos(srv, courseId, true);
  if (freeResult.missingRelation) {
    return NextResponse.json({
      videos: [],
      hasCourseAccess: false,
      authed: false,
      warning: "视频表尚未初始化，请先执行数据库迁移（course_videos）。",
    });
  }
  if (freeResult.error) {
    return NextResponse.json({ error: freeResult.error }, { status: 500 });
  }

  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) {
    return NextResponse.json({
      videos: freeResult.videos,
      hasCourseAccess: false,
      authed: false,
      warning: freeResult.missingViewCounter ? "观看计数器尚未初始化，请先执行数据库迁移。" : undefined,
    });
  }

  const isSuper = await isSuperUserById(srv, auth.userId);
  const hasAccess = isSuper || (await checkCourseAccess(srv, auth.userId, courseId));
  if (!hasAccess) {
    return NextResponse.json({
      videos: freeResult.videos,
      hasCourseAccess: false,
      authed: true,
      warning: freeResult.missingViewCounter ? "观看计数器尚未初始化，请先执行数据库迁移。" : undefined,
    });
  }

  const allResult = await listCourseVideos(srv, courseId, false);
  if (allResult.missingRelation) {
    return NextResponse.json({
      videos: freeResult.videos,
      hasCourseAccess: false,
      authed: true,
      warning: "视频表尚未初始化，请先执行数据库迁移（course_videos）。",
    });
  }
  if (allResult.error) {
    return NextResponse.json({ error: allResult.error }, { status: 500 });
  }
  return NextResponse.json({
    videos: allResult.videos,
    hasCourseAccess: true,
    authed: true,
    warning:
      freeResult.missingViewCounter || allResult.missingViewCounter
        ? "观看计数器尚未初始化，请先执行数据库迁移。"
        : undefined,
  });
}
