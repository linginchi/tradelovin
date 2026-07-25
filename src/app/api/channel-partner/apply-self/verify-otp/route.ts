import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyOtp } from "@/lib/auth/admin-otp";
import { normalizeKolEmail } from "@/lib/channel-partner/kol-application-constants";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().email().max(255),
  code: z.string().min(6).max(6),
});

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
  const code = parsed.data.code.trim();

  const { data: application } = await srv
    .from("kol_applications")
    .select("id,status,email_verified")
    .eq("email", email)
    .eq("status", "pending_verification")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!application?.id) {
    return NextResponse.json(
      { success: false, error: "未找到待验证的申请，请重新提交" },
      { status: 404 },
    );
  }

  const now = new Date().toISOString();
  const { data: otpRows } = await srv
    .from("email_verification_codes")
    .select("id,code_hash,expires_at")
    .eq("email", email)
    .eq("intent", "kol_application")
    .gte("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1);

  const otpRow = otpRows?.[0];
  if (!otpRow?.code_hash) {
    return NextResponse.json(
      { success: false, error: "验证码已过期，请重新获取" },
      { status: 400 },
    );
  }

  const valid = await verifyOtp(email, code, String(otpRow.code_hash));
  if (!valid) {
    return NextResponse.json({ success: false, error: "验证码错误" }, { status: 400 });
  }

  const verifiedAt = new Date().toISOString();
  const { error: updateErr } = await srv
    .from("kol_applications")
    .update({
      email_verified: true,
      email_verified_at: verifiedAt,
      status: "pending_review",
      updated_at: verifiedAt,
    })
    .eq("id", application.id);

  if (updateErr) {
    return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
  }

  await srv.from("email_verification_codes").delete().eq("id", otpRow.id);

  return NextResponse.json({
    success: true,
    message: "申请已提交，请等待管理员审核",
    data: { applicationId: application.id },
  });
}
