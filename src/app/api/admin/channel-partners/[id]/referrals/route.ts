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
  const { data: referrals, error } = await srv
    .from("referrals")
    .select(
      `id, code, status, created_at, completed_at, reward_granted,
      referee_id,
      commission_records(tuition_amount, commission_amount, status, settlement_month)`,
    )
    .eq("partner_id", id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // 获取学员昵称
  const refereeIds = [
    ...new Set((referrals ?? []).map((r) => r.referee_id).filter(Boolean)),
  ] as string[];
  const { data: profiles } = await srv
    .from("profiles")
    .select("user_id, nickname, real_name")
    .in("user_id", refereeIds);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.user_id, p.nickname ?? p.real_name ?? ""]),
  );

  const rows = (referrals ?? []).map((r) => ({
    id: r.id,
    studentName: profileMap.get(r.referee_id) ?? "未知",
    refereeId: r.referee_id,
    code: r.code,
    status: r.status,
    tuitionAmount:
      (r.commission_records as Array<Record<string, unknown>> | undefined)?.[0]
        ?.tuition_amount ?? null,
    commissionAmount:
      (r.commission_records as Array<Record<string, unknown>> | undefined)?.[0]
        ?.commission_amount ?? null,
    commissionStatus:
      (r.commission_records as Array<Record<string, unknown>> | undefined)?.[0]
        ?.status ?? null,
    createdAt: r.created_at,
  }));

  return NextResponse.json({ success: true, data: { rows, total: rows.length } });
}
