import { NextResponse } from "next/server";

import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  const { data: partner } = await srv
    .from("channel_partners")
    .select("id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (!partner) {
    return NextResponse.json({ success: false, error: "不是渠道合作伙伴" }, { status: 403 });
  }

  const { data: referrals } = await srv
    .from("referrals")
    .select(`
      id, code, status, created_at, completed_at,
      referee_id,
      commission_records(tuition_amount, commission_amount, status, settlement_month)
    `)
    .eq("partner_id", partner.id)
    .order("created_at", { ascending: false })
    .limit(100);

  // 获取学员昵称
  const refereeIds = [
    ...new Set((referrals ?? []).map((r) => r.referee_id).filter(Boolean)),
  ] as string[];
  const { data: profiles } = await srv
    .from("profiles")
    .select("user_id, nickname, real_name")
    .in("user_id", refereeIds);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.user_id, p.nickname ?? p.real_name ?? "未知"]),
  );

  const rows = (referrals ?? []).map((r) => ({
    id: r.id,
    code: r.code,
    studentName: profileMap.get(r.referee_id) ?? "未知",
    status: r.status,
    tuitionAmount: (r.commission_records as Array<Record<string, unknown>> | undefined)?.[0]?.tuition_amount ?? 0,
    commissionAmount: (r.commission_records as Array<Record<string, unknown>> | undefined)?.[0]?.commission_amount ?? 0,
    commissionStatus: (r.commission_records as Array<Record<string, unknown>> | undefined)?.[0]?.status ?? null,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  }));

  return NextResponse.json({ success: true, data: { rows, total: rows.length } });
}
