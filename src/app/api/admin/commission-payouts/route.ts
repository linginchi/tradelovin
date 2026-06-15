import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET() {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  const { data: payouts, error } = await srv
    .from("commission_payouts")
    .select("*, channel_partners!inner(channel_name, channel_type, platform)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // 按 settlement_month 分组统计
  const monthStats = new Map<
    string,
    { total: number; pendingCount: number; paidCount: number }
  >();
  for (const p of payouts ?? []) {
    const month = p.settlement_month as string;
    const entry = monthStats.get(month) ?? {
      total: 0,
      pendingCount: 0,
      paidCount: 0,
    };
    entry.total += Number(p.total_commission);
    if (p.status === "pending") entry.pendingCount++;
    if (p.status === "paid") entry.paidCount++;
    monthStats.set(month, entry);
  }

  return NextResponse.json({
    success: true,
    data: {
      rows: payouts ?? [],
      monthStats: Array.from(monthStats.entries()).map(([month, stats]) => ({
        month,
        ...stats,
        total: Math.round(stats.total * 100) / 100,
      })),
    },
  });
}
