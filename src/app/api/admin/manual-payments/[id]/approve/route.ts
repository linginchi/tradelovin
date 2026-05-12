import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { activateMembership } from "@/lib/membership/activate";
import { recordPaymentTransaction } from "@/lib/membership/payments";
import { resolvePeriod } from "@/lib/membership/plans";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  const { id } = await params;
  const { data: order, error } = await srv
    .from("manual_payment_orders")
    .select("id,user_id,order_no,plan,period,amount,status")
    .eq("id", id)
    .maybeSingle();

  if (error || !order) {
    return NextResponse.json({ success: false, error: "订单不存在" }, { status: 404 });
  }
  if (order.status === "paid") {
    return NextResponse.json({ success: true, data: order });
  }

  const period = resolvePeriod(order.period) ?? "monthly";
  if (order.plan !== "T1" && order.plan !== "T2" && order.plan !== "T3") {
    return NextResponse.json({ success: false, error: "无效会员计划" }, { status: 400 });
  }

  await activateMembership(srv, {
    userId: order.user_id,
    plan: order.plan,
    period,
  });

  const nowIso = new Date().toISOString();
  await srv
    .from("manual_payment_orders")
    .update({
      status: "paid",
      paid_at: nowIso,
      admin_notes: `approved by ${gated.session.email}`,
    })
    .eq("id", id);

  await recordPaymentTransaction(srv, {
    userId: order.user_id,
    orderId: order.id,
    gateway: "manual",
    amount: Number(order.amount ?? 0),
    status: "paid",
    metadata: { orderNo: order.order_no, approvedBy: gated.session.email },
  });

  return NextResponse.json({ success: true });
}
