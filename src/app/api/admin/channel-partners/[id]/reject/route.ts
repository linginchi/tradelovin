import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

const rejectSchema = z.object({
  reason: z.string().max(500).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  const { id } = await params;

  const { data: partner, error: fetchErr } = await srv
    .from("channel_partners")
    .select("id,status")
    .eq("id", id)
    .single();

  if (fetchErr || !partner) {
    return NextResponse.json({ success: false, error: "未找到该申请" }, { status: 404 });
  }

  if (partner.status !== "pending_review") {
    return NextResponse.json({ success: false, error: "该申请状态不允许驳回" }, { status: 400 });
  }

  let reason = "";
  try {
    const raw = await request.json();
    const parsed = rejectSchema.safeParse(raw);
    if (parsed.success) reason = parsed.data.reason ?? "";
  } catch {
    // body is optional
  }

  const { error } = await srv
    .from("channel_partners")
    .update({
      status: "terminated",
      updated_at: new Date().toISOString(),
      payout_info: reason ? { reject_reason: reason } : null,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
