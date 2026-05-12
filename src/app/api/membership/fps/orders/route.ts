import { NextResponse } from "next/server";

import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await auth.supabase
    .from("manual_payment_orders")
    .select("id,order_no,plan,period,amount,status,proof_image_url,admin_notes,created_at,paid_at,expires_at")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: data ?? [] });
}
