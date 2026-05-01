import { NextResponse } from "next/server";

import { getPointsSummary } from "@/lib/points/service";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;

  const srv = getServiceSupabase();
  if (!srv) {
    return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
  }

  const summary = await getPointsSummary(srv, auth.userId);
  return NextResponse.json({ success: true, data: summary });
}
