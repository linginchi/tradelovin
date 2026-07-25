import { NextResponse } from "next/server";
import { z } from "zod";

import { generateOtpCode, hashOtp } from "@/lib/auth/admin-otp";
import {
  KOL_MAX_PLATFORM_ACCOUNTS,
  KOL_OTP_EXPIRE_MINUTES,
  KOL_OTP_SEND_LIMIT_PER_HOUR,
  KOL_PLATFORMS,
  normalizeKolEmail,
} from "@/lib/channel-partner/kol-application-constants";
import { sendAdminEmail } from "@/lib/email/admin-mail";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

const platformAccountSchema = z.object({
  platform: z.enum(KOL_PLATFORMS),
  account: z.string().min(1).max(100).trim(),
});

const bodySchema = z.object({
  email: z.string().email().max(255),
  platformAccounts: z.array(platformAccountSchema).min(1).max(KOL_MAX_PLATFORM_ACCOUNTS),
  channelName: z.string().min(1).max(100).optional(),
});

async function countRecentOtpSends(
  srv: NonNullable<ReturnType<typeof getServiceSupabase>>,
  email: string,
): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await srv
    .from("email_verification_codes")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .eq("intent", "kol_application")
    .gte("created_at", since);

  if (error) return KOL_OTP_SEND_LIMIT_PER_HOUR;
  return count ?? 0;
}

export async function POST(request: Request) {
  const srv = getServiceSupabase();
  if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

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

  const email = normalizeKolEmail(parsed.data.email);
  const channelName = parsed.data.channelName?.trim() || null;
  const platformAccounts = parsed.data.platformAccounts.map((row) => ({
    platform: row.platform,
    account: row.account.trim(),
  }));

  const { data: existing } = await srv
    .from("kol_applications")
    .select("id,status")
    .eq("email", email)
    .in("status", ["pending_verification", "pending_review"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.status === "pending_review") {
    return NextResponse.json(
      { success: false, error: "您的申请正在审核中，请耐心等待" },
      { status: 409 },
    );
  }

  const recentSends = await countRecentOtpSends(srv, email);
  if (recentSends >= KOL_OTP_SEND_LIMIT_PER_HOUR) {
    return NextResponse.json(
      { success: false, error: "验证码发送过于频繁，请稍后再试" },
      { status: 429 },
    );
  }

  let applicationId: string;

  if (existing?.status === "pending_verification" && existing.id) {
    const { error: updateErr } = await srv
      .from("kol_applications")
      .update({
        channel_name: channelName,
        platform_accounts: platformAccounts,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (updateErr) {
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
    }
    applicationId = existing.id;
  } else {
    const { data: inserted, error: insertErr } = await srv
      .from("kol_applications")
      .insert({
        email,
        channel_name: channelName,
        platform_accounts: platformAccounts,
        status: "pending_verification",
        email_verified: false,
      })
      .select("id")
      .single();

    if (insertErr || !inserted?.id) {
      return NextResponse.json(
        { success: false, error: insertErr?.message ?? "创建申请失败" },
        { status: 500 },
      );
    }
    applicationId = inserted.id;
  }

  const otpCode = generateOtpCode();
  const codeHash = await hashOtp(email, otpCode);
  const expiresAt = new Date(Date.now() + KOL_OTP_EXPIRE_MINUTES * 60 * 1000).toISOString();

  const { error: otpErr } = await srv.from("email_verification_codes").insert({
    email,
    code_hash: codeHash,
    intent: "kol_application",
    expires_at: expiresAt,
  });

  if (otpErr) {
    return NextResponse.json({ success: false, error: otpErr.message }, { status: 500 });
  }

  const mail = await sendAdminEmail({
    to: email,
    subject: "交易豹 KOL 申请验证码",
    text: [
      `您的验证码是：${otpCode}`,
      "",
      `验证码 ${KOL_OTP_EXPIRE_MINUTES} 分钟内有效。`,
      "",
      "如非本人操作，请忽略此邮件。",
    ].join("\n"),
    html: `
      <p>您正在提交 KOL/渠道合作伙伴自荐申请。</p>
      <p>您的验证码是：<strong>${otpCode}</strong></p>
      <p>验证码 ${KOL_OTP_EXPIRE_MINUTES} 分钟内有效。</p>
      <p>如非本人操作，请忽略此邮件。</p>
    `,
  });

  if (!mail.ok) {
    return NextResponse.json(
      { success: false, error: "验证码邮件发送失败，请稍后重试" },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: "验证码已发送到您的邮箱，请查收",
      data: { applicationId, email },
    },
    { status: 201 },
  );
}
