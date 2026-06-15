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
    .select("status")
    .eq("id", id)
    .single();

  if (fetchError || !payout) {
    return NextResponse.json({ success: false, error: "月结单不存在" }, { status: 404 });
  }
  if (payout.status !== "pending") {
    return NextResponse.json(
      { success: false, error: "只有待审核的月结单可以审核通过" },
      { status: 400 },
    );
  }

  const { error } = await srv
    .from("commission_payouts")
    .update({ status: "approved" })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
