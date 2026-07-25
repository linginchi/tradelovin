import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  const { id } = await params;

  const { data: payout, error: fetchError } = await srv
    .from("commission_payouts")
    .select("status, partner_id, total_commission, settlement_month")
    .eq("id", id)
    .single();

  if (fetchError || !payout) {
    return NextResponse.json({ success: false, error: "月结单不存在" }, { status: 404 });
  }
  if (payout.status !== "approved") {
    return NextResponse.json(
      { success: false, error: "只有已审核的月结单可以标记打款" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();

  // 1. 更新月结单为已付
  const { error: payoutError } = await srv
    .from("commission_payouts")
    .update({ status: "paid", paid_at: now })
    .eq("id", id);
  if (payoutError) {
    return NextResponse.json({ success: false, error: payoutError.message }, { status: 500 });
  }

  // 2. 更新对应的 commission_records 为 paid
  await srv
    .from("commission_records")
    .update({ status: "paid", paid_at: now })
    .eq("partner_id", payout.partner_id)
    .eq("settlement_month", payout.settlement_month)
    .in("status", ["locked"]);

  // 3. 递增 KOL 累计已付（RPC 保证原子累加，避免覆盖历史值）
  const { error: rpcError } = await srv.rpc(
    "increment_channel_partner_total_paid",
    {
      p_partner_id: payout.partner_id,
      p_amount: payout.total_commission,
    },
  );
  if (rpcError) {
    console.error("[pay] increment_total_paid RPC failed:", rpcError);
  }

  return NextResponse.json({ success: true });
}
