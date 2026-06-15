import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { generateReferralCode } from "@/lib/referral/service";

export const runtime = "nodejs";

const createSchema = z.object({
  userId: z.string().uuid(),
  channelType: z.enum(["kol", "channel"]).default("kol"),
  channelName: z.string().min(1).max(100),
  channelId: z.string().optional(),
  platform: z.string().optional(),
  commissionRate: z.number().min(0).max(1).default(0.2),
  contactEmail: z.string().email().optional().or(z.literal("")),
});

export async function GET() {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  const { data: partners, error } = await srv
    .from("channel_partners")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // 获取每个 KOL 的学员数和本月预估佣金
  const partnerIds = partners.map((p) => p.id);
  const [referralCountsResult, commissionSumsResult] = await Promise.all([
    srv
      .from("referrals")
      .select("partner_id, count")
      .in("partner_id", partnerIds)
      .not("referee_id", "is", null),
    srv
      .from("commission_records")
      .select("partner_id, commission_amount")
      .in("partner_id", partnerIds)
      .in("status", ["pending", "locked"]),
  ]);

  const referralCountMap = new Map<string, number>();
  for (const r of referralCountsResult.data ?? []) {
    referralCountMap.set(
      r.partner_id,
      (referralCountMap.get(r.partner_id) ?? 0) + 1,
    );
  }

  const commissionSumMap = new Map<string, number>();
  for (const r of commissionSumsResult.data ?? []) {
    commissionSumMap.set(
      r.partner_id,
      (commissionSumMap.get(r.partner_id) ?? 0) + Number(r.commission_amount),
    );
  }

  const rows = partners.map((p) => ({
    ...p,
    studentCount: referralCountMap.get(p.id) ?? 0,
    monthEstimate: Math.round((commissionSumMap.get(p.id) ?? 0) * 100) / 100,
  }));

  return NextResponse.json({ success: true, data: { rows } });
}

export async function POST(request: Request) {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "参数错误: " + parsed.error.message },
      { status: 400 },
    );
  }

  // 1. 插入 channel_partner
  const { data: partner, error } = await srv
    .from("channel_partners")
    .insert({
      user_id: parsed.data.userId,
      channel_type: parsed.data.channelType,
      channel_name: parsed.data.channelName,
      channel_id: parsed.data.channelId ?? null,
      platform: parsed.data.platform ?? null,
      commission_rate: parsed.data.commissionRate,
      contact_email: parsed.data.contactEmail ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // 2. 为 KOL 生成专属邀请码
  await generateReferralCode(srv, parsed.data.userId);

  return NextResponse.json({ success: true, data: { id: partner.id } }, { status: 201 });
}
