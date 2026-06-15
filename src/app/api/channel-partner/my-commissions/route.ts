import { NextResponse } from "next/server";

import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  const { data: partner } = await srv
    .from("channel_partners")
    .select("id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (!partner) {
    return NextResponse.json({ success: false, error: "不是渠道合作伙伴" }, { status: 403 });
  }

  const [commissionsResult, payoutsResult] = await Promise.all([
    srv
      .from("commission_records")
      .select("*")
      .eq("partner_id", partner.id)
      .order("created_at", { ascending: false })
      .limit(100),
    srv
      .from("commission_payouts")
      .select("*")
      .eq("partner_id", partner.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      commissions: commissionsResult.data ?? [],
      payouts: payoutsResult.data ?? [],
    },
  });
}
