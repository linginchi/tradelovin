import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  const { id } = await params;

  const [commissionsResult, payoutsResult] = await Promise.all([
    srv
      .from("commission_records")
      .select("*")
      .eq("partner_id", id)
      .order("created_at", { ascending: false })
      .limit(500),
    srv
      .from("commission_payouts")
      .select("*")
      .eq("partner_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      commissions: commissionsResult.data ?? [],
      payouts: payoutsResult.data ?? [],
    },
  });
}
