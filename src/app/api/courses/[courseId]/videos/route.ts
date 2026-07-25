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

  // 查全部视频（游客也可看到完整列表，试看控制由 play API 处理）
  const { data: allVideos, error: videoErr } = await srv
    .from("course_videos")
    .select("id, course_id, title, description, duration, sort_order, is_free_preview, view_count")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (videoErr) {
    if (isMissingRelationError(videoErr, "course_videos")) {
      return NextResponse.json({
        videos: [],
        hasCourseAccess: false,
        authed: false,
        warning: "视频表尚未初始化，请先执行数据库迁移（course_videos）。",
      });
    }
    return NextResponse.json({ error: videoErr.message }, { status: 500 });
  }

  // 查询课程合作伙伴二维码（列可能暂未建立，做容错）
  let partnerQrUrl: string | null = null;
  let partnerQrLabel = "合作夥伴";
  try {
    const { data: courseData } = await srv
      .from("courses")
      .select("partner_qr_url, partner_qr_label")
      .eq("id", courseId)
      .maybeSingle();
    partnerQrUrl = courseData?.partner_qr_url ?? null;
    partnerQrLabel = courseData?.partner_qr_label ?? "合作夥伴";
  } catch {
    // partner_qr_url / partner_qr_label 列可能尚未建立，忽略
  }

  // 未登录 → 显示全部视频，无课程权限
  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) {
    return NextResponse.json({
      videos: allVideos ?? [],
      hasCourseAccess: false,
      authed: false,
      partnerQrUrl,
      partnerQrLabel,
    });
  }

  // 已登录 → 检查课程权限
  const isSuper = await isSuperUserById(srv, auth.userId);
  const hasAccess = isSuper || (await checkCourseAccess(srv, auth.userId, courseId));

  return NextResponse.json({
    videos: allVideos ?? [],
    hasCourseAccess: hasAccess,
    authed: true,
    partnerQrUrl,
    partnerQrLabel,
  });
}
