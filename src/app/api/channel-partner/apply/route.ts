import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTradeUser } from "@/lib/trade/require-user";
import { getServiceSupabase } from "@/lib/supabase/service";
import { generateReferralCode } from "@/lib/referral/service";

export const runtime = "nodejs";

const applyByInviteSchema = z.object({
  inviteCode: z.string().min(1).max(20),
  channelName: z.string().min(1).max(100).optional(),
});

const applyByReferralSchema = z.object({
  referralLink: z.string().min(1).max(500),
  channelName: z.string().min(1).max(100).optional(),
});

const bodySchema = z.union([applyByInviteSchema, applyByReferralSchema]);

function extractReferralCode(input: string): string {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const ref = url.searchParams.get("ref");
    if (ref && /^[A-Fa-f0-9]{6,12}$/.test(ref)) return ref.toUpperCase();
  } catch {
    // not a URL, treat as raw code
  }
  if (/^[A-Fa-f0-9]{6,12}$/.test(trimmed)) return trimmed.toUpperCase();
  return "";
}

export async function POST(request: Request) {
  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  // 检查是否已经是 partner
  const { data: existing } = await srv
    .from("channel_partners")
    .select("id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ success: false, error: "您已经是渠道合作伙伴" }, { status: 409 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "参数错误: " + parsed.error.message },
      { status: 400 },
    );
  }

  let channelName = parsed.data.channelName ?? "";

  // 方式一：邀请码
  if ("inviteCode" in parsed.data) {
    const { data: inviteRow, error: inviteErr } = await srv
      .from("kol_invite_codes")
      .select("*")
      .eq("code", parsed.data.inviteCode.trim().toUpperCase())
      .eq("status", "active")
      .maybeSingle();

    if (inviteErr || !inviteRow) {
      return NextResponse.json({ success: false, error: "邀请码无效或已使用" }, { status: 400 });
    }

    // 标记邀请码已使用
    await srv
      .from("kol_invite_codes")
      .update({ status: "used", used_by: auth.userId, used_at: new Date().toISOString() })
      .eq("code", inviteRow.code);

    if (!channelName) {
      const { data: profile } = await srv
        .from("profiles")
        .select("nickname")
        .eq("id", auth.userId)
        .maybeSingle();
      channelName = String(profile?.nickname ?? "KOL");
    }

    // 创建 channel_partner
    const { data: partner, error } = await srv
      .from("channel_partners")
      .insert({
        user_id: auth.userId,
        channel_type: "kol",
        channel_name: channelName,
        commission_rate: 0.2,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const { code } = await generateReferralCode(srv, auth.userId);
    return NextResponse.json({ success: true, data: { partnerId: partner.id, referralCode: code } }, { status: 201 });
  }

  // 方式二：通过 KOL 推荐链接
  const refCode = extractReferralCode(parsed.data.referralLink);
  if (!refCode) {
    return NextResponse.json({ success: false, error: "未找到有效推荐码，请检查链接是否正确" }, { status: 400 });
  }

  const { data: refRow, error: refErr } = await srv
    .from("referrals")
    .select("referrer_id, code")
    .eq("code", refCode)
    .maybeSingle();

  if (refErr || !refRow) {
    return NextResponse.json({ success: false, error: "未找到对应 KOL，请检查链接是否正确" }, { status: 400 });
  }

  // 验证 referrer 是否为 active KOL
  const { data: partnerCheck } = await srv
    .from("channel_partners")
    .select("id")
    .eq("user_id", refRow.referrer_id)
    .eq("status", "active")
    .maybeSingle();

  if (!partnerCheck) {
    return NextResponse.json({ success: false, error: "该推荐人不是有效的渠道合作伙伴" }, { status: 400 });
  }

  if (!channelName) {
    const { data: profile } = await srv
      .from("profiles")
      .select("nickname")
      .eq("id", auth.userId)
      .maybeSingle();
    channelName = String(profile?.nickname ?? "KOL");
  }

  const { data: partner, error } = await srv
    .from("channel_partners")
    .insert({
      user_id: auth.userId,
      channel_type: "kol",
      channel_name: channelName,
      commission_rate: 0.2,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const { code } = await generateReferralCode(srv, auth.userId);
  return NextResponse.json({ success: true, data: { partnerId: partner.id, referralCode: code } }, { status: 201 });
}
