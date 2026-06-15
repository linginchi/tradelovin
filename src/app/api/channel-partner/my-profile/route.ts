import { NextResponse } from "next/server";

import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  // 查 KOL 档案
  const { data: partner } = await srv
    .from("channel_partners")
    .select("*")
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (!partner) {
    return NextResponse.json({ success: true, isPartner: false });
  }

  // 获取该 KOL 的推广码
  let referralCode = "";
  const { data: refRow } = await srv
    .from("referrals")
    .select("code")
    .eq("referrer_id", auth.userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (refRow?.code) referralCode = String(refRow.code);

  // 本月预估佣金（pending + locked 且未入月结的记录）
  const { data: pendingCommissions } = await srv
    .from("commission_records")
    .select("commission_amount,status")
    .eq("partner_id", partner.id)
    .is("settlement_month", null)
    .in("status", ["pending", "locked"]);

  const monthEstimate = (pendingCommissions ?? []).reduce(
    (sum, r) => sum + Number(r.commission_amount),
    0,
  );

  const stats = {
    monthEstimate: Math.round(monthEstimate * 100) / 100,
    totalEarned: Number(partner.total_earned),
    totalPaid: Number(partner.total_paid),
    pendingAmount: (pendingCommissions ?? [])
      .filter((r) => r.status === "pending")
      .reduce((s, r) => s + Number(r.commission_amount), 0),
  };

  return NextResponse.json({
    success: true,
    isPartner: true,
    data: {
      partner: {
        id: partner.id,
        channelName: partner.channel_name,
        channelType: partner.channel_type,
        platform: partner.platform,
        commissionRate: Number(partner.commission_rate),
        status: partner.status,
        payoutInfo: partner.payout_info,
      },
      stats,
      referralCode,
    },
  });
}
