import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { generateReferralCode } from "@/lib/referral/service";

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

  // 获取 partner 并验证状态
  const { data: partner, error: fetchErr } = await srv
    .from("channel_partners")
    .select("id,user_id,status")
    .eq("id", id)
    .single();

  if (fetchErr || !partner) {
    return NextResponse.json({ success: false, error: "未找到该申请" }, { status: 404 });
  }

  if (partner.status !== "pending_review") {
    return NextResponse.json({ success: false, error: "该申请状态不允许审核" }, { status: 400 });
  }

  // 审核通过：更新状态 + 生成推荐码
  const { error } = await srv
    .from("channel_partners")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  await generateReferralCode(srv, partner.user_id);

  return NextResponse.json({ success: true });
}
