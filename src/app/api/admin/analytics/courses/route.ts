import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { computeCourseAnalytics } from "@/lib/analytics/video-stats";

export const runtime = "nodejs";

export async function GET() {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;

  try {
    const courses = await computeCourseAnalytics();
    return NextResponse.json({ courses });
  } catch (err) {
    console.error("[analytics/courses]", err);
    return NextResponse.json({ error: "获取课程统计失败" }, { status: 500 });
  }
}
