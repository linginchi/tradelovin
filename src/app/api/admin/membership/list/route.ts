import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;
  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  const url = new URL(request.url);
  const plan = url.searchParams.get("plan");
  const status = url.searchParams.get("status");

  let query = srv
    .from("user_memberships")
    .select("id,user_id,plan,status,current_period_end,cancel_at_period_end,updated_at")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (plan) query = query.eq("plan", plan);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: data ?? [] });
}
