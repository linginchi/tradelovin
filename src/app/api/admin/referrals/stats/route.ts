import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET() {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;
  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  const [{ data: referrals, count: total }, { count: completedPaymentCount }, { count: rewardedCount }] =
    await Promise.all([
      srv
        .from("referrals")
        .select("id,referrer_id,referee_id,status,reward_granted,created_at,completed_at", {
          count: "exact",
        })
        .order("created_at", { ascending: false })
        .limit(500),
      srv
        .from("referrals")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed_payment"),
      srv
        .from("referrals")
        .select("id", { count: "exact", head: true })
        .eq("reward_granted", true),
    ]);

  return NextResponse.json({
    success: true,
    data: {
      total: total ?? 0,
      completedPayment: completedPaymentCount ?? 0,
      rewarded: rewardedCount ?? 0,
      conversionRate: (total ?? 0) > 0 ? Number((((completedPaymentCount ?? 0) / (total ?? 0)) * 100).toFixed(2)) : 0,
      rows: referrals ?? [],
    },
  });
}
