import { NextResponse } from "next/server";

import { lockCommissions } from "@/lib/commission/service";
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

  const locked = await lockCommissions(srv);
  return NextResponse.json({ success: true, data: { locked } });
}
