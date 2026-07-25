import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import {
  computeAnalyticsOverview,
  getCurrentMonthLabel,
  getLastMonthLabel,
  getMonthlyGrowth,
} from "@/lib/analytics/video-stats";

export const runtime = "nodejs";

export async function GET() {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;

  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12

    // 只返回已完成的月份（本月未结束时不返回）
    const completedMonths: { month: string; label: string; memberGrowth: number }[] = [];

    // 从 2026年3月开始到上个月为止
    const startYear = 2026;
    const startMonth = 3; // 3月
    const endYear = currentMonth > 1 ? currentYear : currentYear - 1;
    const endMonth = currentMonth > 1 ? currentMonth - 1 : 12;

    let y = startYear;
    let m = startMonth;
    while (y < endYear || (y === endYear && m <= endMonth)) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      completedMonths.push({
        month: key,
        label: `${m}月`,
        memberGrowth: getMonthlyGrowth(key),
      });
      m++;
      if (m > 12) { m = 1; y++; }
    }

    const overview = await computeAnalyticsOverview();
    return NextResponse.json({
      ...overview,
      completedMonths,
      monthLabel: getCurrentMonthLabel(),
      lastMonthLabel: getLastMonthLabel(),
    });
  } catch (err) {
    console.error("[analytics/overview]", err);
    return NextResponse.json({ error: "获取统计数据失败" }, { status: 500 });
  }
}
