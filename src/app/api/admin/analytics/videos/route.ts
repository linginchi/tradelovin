import { NextRequest, NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { computeVideoAnalytics } from "@/lib/analytics/video-stats";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;

  try {
    const courseId = request.nextUrl.searchParams.get("courseId") ?? undefined;
    const videos = await computeVideoAnalytics();

    const filtered = courseId
      ? videos.filter((v) => v.courseId === courseId)
      : videos;

    return NextResponse.json({ videos: filtered });
  } catch (err) {
    console.error("[analytics/videos]", err);
    return NextResponse.json({ error: "获取视频统计失败" }, { status: 500 });
  }
}
