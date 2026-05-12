import { NextResponse } from "next/server";

import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await auth.supabase
    .from("payment_transactions")
    .select("id,order_id,gateway,amount,currency,status,metadata,created_at")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: data ?? [] });
}
