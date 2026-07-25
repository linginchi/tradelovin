import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import {
  getOriginFromRequest,
  randomKolInviteCode,
} from "@/lib/channel-partner/kol-application";
import { sendAdminEmail } from "@/lib/email/admin-mail";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gated = await requireAdminSession();
  if (gated instanceof NextResponse) return gated;

  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

  const { id } = await params;

  const { data: application, error: fetchErr } = await srv
    .from("kol_applications")
    .select("id,email,status,channel_name")
    .eq("id", id)
    .single();

  if (fetchErr || !application) {
    return NextResponse.json({ success: false, error: "未找到该申请" }, { status: 404 });
  }

  if (application.status !== "pending_review") {
    return NextResponse.json({ success: false, error: "该申请状态不允许审核" }, { status: 400 });
  }

  let code = randomKolInviteCode();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data: existing } = await srv
      .from("kol_invite_codes")
      .select("code")
      .eq("code", code)
      .maybeSingle();
    if (!existing) break;
    code = randomKolInviteCode();
  }

  const { error: inviteErr } = await srv.from("kol_invite_codes").insert({
    code,
    created_by: gated.session.email,
    status: "active",
    target_user_id: null,
    notes: `KOL自荐审核通过 application:${application.id}`,
  });

  if (inviteErr) {
    return NextResponse.json({ success: false, error: inviteErr.message }, { status: 500 });
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await srv
    .from("kol_applications")
    .update({
      status: "approved",
      invite_code: code,
      updated_at: now,
    })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
  }

  const origin = getOriginFromRequest(request);
  const inviteUrl = `${origin}/register?invite=${code}`;
  const displayName = application.channel_name?.trim() || "KOL 合作伙伴";

  const mail = await sendAdminEmail({
    to: application.email,
    subject: "您已通过交易豹 KOL 审核，请查收邀请码",
    text: [
      `恭喜！您提交的 KOL 申请已通过审核，${displayName}。`,
      "",
      `您的专属注册邀请码：${code}`,
      "",
      `点击以下链接完成注册（成为渠道合作伙伴后可获得 20% 分佣）：`,
      inviteUrl,
      "",
      "邀请码 30 天内有效。",
    ].join("\n"),
    html: `
      <p>恭喜！您提交的 KOL 申请已通过审核。</p>
      <p>您的专属注册邀请码：<strong>${code}</strong></p>
      <p>点击以下链接完成注册（成为渠道合作伙伴后可获得 20% 分佣）：</p>
      <p><a href="${inviteUrl}">${inviteUrl}</a></p>
      <p>邀请码 30 天内有效。</p>
    `,
  });

  if (!mail.ok) {
    return NextResponse.json(
      {
        success: false,
        error: `审核已通过但邮件发送失败：${mail.message}`,
        data: { inviteCode: code, inviteUrl },
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    success: true,
    message: `邀请码已发送至 ${application.email}`,
    data: { inviteCode: code, inviteUrl, email: application.email },
  });
}
