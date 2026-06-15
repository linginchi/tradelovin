import { NextResponse } from "next/server";

import { settleMonthlyCommissions } from "@/lib/commission/service";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.INTERNAL_WEBHOOK_TOKEN;
  const token = request.headers.get("x-internal-token");
  if (secret && token !== secret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  // 结算上个月
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const settlementMonth = prevMonth.toISOString().slice(0, 7);

  const count = await settleMonthlyCommissions(srv, settlementMonth);
  return NextResponse.json({
    success: true,
    data: { settlementMonth, payoutCount: count },
  });
}
