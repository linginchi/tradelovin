import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

const bodySchema = z.object({
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

  let reason: string | null = null;
  try {
    const raw = await request.json();
    const parsed = bodySchema.safeParse(raw);
    if (parsed.success && parsed.data.reason?.trim()) {
      reason = parsed.data.reason.trim();
    }
  } catch {
    // optional body
  }

  const { data: application, error: fetchErr } = await srv
    .from("kol_applications")
    .select("id,status")
    .eq("id", id)
    .single();

  if (fetchErr || !application) {
    return NextResponse.json({ success: false, error: "未找到该申请" }, { status: 404 });
  }

  if (application.status !== "pending_review") {
    return NextResponse.json({ success: false, error: "该申请状态不允许驳回" }, { status: 400 });
  }

  const { error } = await srv
    .from("kol_applications")
    .update({
      status: "rejected",
      reject_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
