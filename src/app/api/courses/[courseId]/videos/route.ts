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

export async function GET(_request: Request, { params }: RouteContext) {
  const { courseId } = await params;
  if (!z.string().uuid().safeParse(courseId).success) {
    return NextResponse.json({ error: "课程 ID 无效" }, { status: 400 });
  }

  const srv = getServiceSupabase();
  if (!srv) {
    return NextResponse.json({ error: "服务不可用" }, { status: 503 });
  }

  const { data: freeVideos, error: freeErr } = await srv
    .from("course_videos")
    .select("id, course_id, title, description, duration, sort_order, is_free_preview, view_count")
    .eq("course_id", courseId)
    .eq("is_free_preview", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (freeErr) {
    if (isMissingRelationError(freeErr, "course_videos")) {
      return NextResponse.json({
        videos: [],
        hasCourseAccess: false,
        authed: false,
        warning: "视频表尚未初始化，请先执行数据库迁移（course_videos）。",
      });
    }
    return NextResponse.json({ error: freeErr.message }, { status: 500 });
  }

  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) {
    return NextResponse.json({
      videos: freeVideos ?? [],
      hasCourseAccess: false,
      authed: false,
    });
  }

  const isSuper = await isSuperUserById(srv, auth.userId);
  const hasAccess = isSuper || (await checkCourseAccess(srv, auth.userId, courseId));
  if (!hasAccess) {
    return NextResponse.json({
      videos: freeVideos ?? [],
      hasCourseAccess: false,
      authed: true,
    });
  }

  const { data: allVideos, error } = await srv
    .from("course_videos")
    .select("id, course_id, title, description, duration, sort_order, is_free_preview, view_count")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingRelationError(error, "course_videos")) {
      return NextResponse.json({
        videos: freeVideos ?? [],
        hasCourseAccess: false,
        authed: true,
        warning: "视频表尚未初始化，请先执行数据库迁移（course_videos）。",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    videos: allVideos ?? [],
    hasCourseAccess: true,
    authed: true,
  });
}
