import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";

import { isAdminPortalEmail } from "@/lib/auth/admin-gate";
import { isFixedBootstrapOtpEnabled } from "@/lib/auth/bootstrap-super-admin";
import { generateOtpCode, hashOtp } from "@/lib/auth/admin-otp";
import { resolveResendEnv } from "@/lib/email/resend-config";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/security/rate-limit";
import { getServiceSupabase } from "@/lib/supabase/service";

const bodySchema = z.object({
	email: z.string().email(),
});

export async function POST(req: Request) {
	const neutralMessage = { ok: true as const, message: "If this email is authorized, a code was sent." };

	let json: unknown;
	try {
		json = await req.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = bodySchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid email" }, { status: 400 });
	}

	const email = parsed.data.email.trim().toLowerCase();
	const ip = clientIpFromHeaders(req.headers);

	const perIp = checkRateLimit({
		bucket: "admin-send-code-ip",
		key: ip,
		windowMs: 10 * 60 * 1000,
		maxHits: 10,
	});
	if (perIp.limited) {
		return NextResponse.json(
			{ error: "Too many requests", errorZh: "请求过于频繁，请稍后重试", code: "RATE_LIMITED" },
			{ status: 429, headers: { "Retry-After": String(perIp.retryAfterSec) } },
		);
	}

	const perEmail = checkRateLimit({
		bucket: "admin-send-code-email",
		key: email,
		windowMs: 10 * 60 * 1000,
		maxHits: 4,
	});
	if (perEmail.limited) {
		return NextResponse.json(
			{ error: "Too many requests", errorZh: "请求过于频繁，请稍后重试", code: "RATE_LIMITED" },
			{ status: 429, headers: { "Retry-After": String(perEmail.retryAfterSec) } },
		);
	}

	if (!isAdminPortalEmail(email)) {
		return NextResponse.json(neutralMessage);
	}

	/**
	 * 开发/测试阶段开启固定 OTP 时，不依赖邮件验证码：返回中性成功即可。
	 * 不提示固定邮箱或固定码，避免在 UI 暴露敏感信息。
	 */
	if (isFixedBootstrapOtpEnabled()) {
		return NextResponse.json(neutralMessage);
	}

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json(
			{
				error: "Server misconfigured",
				errorZh: "缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY，请在 .env.local 配置后重启 dev。",
			},
			{ status: 503 },
		);
	}

	const { data: admin } = await supabase
		.from("admins")
		.select("email")
		.eq("email", email)
		.maybeSingle();

	if (!admin) {
		return NextResponse.json(neutralMessage);
	}

	const resendCfg = resolveResendEnv();
	if (!resendCfg.ok) {
		return NextResponse.json(
			{
				error: resendCfg.errorEn,
				errorZh: resendCfg.error,
				code: resendCfg.code,
				missing: resendCfg.missing,
			},
			{ status: 503 },
		);
	}

	const code = generateOtpCode();
	const codeHash = await hashOtp(email, code);
	const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

	await supabase.from("admin_otp_challenges").delete().eq("email", email);

	const { error: insertErr } = await supabase.from("admin_otp_challenges").insert({
		email,
		code_hash: codeHash,
		expires_at: expiresAt,
	});

	if (insertErr) {
		return NextResponse.json({ error: "Could not create challenge" }, { status: 500 });
	}

	const resend = new Resend(resendCfg.apiKey);
	const { error: sendErr } = await resend.emails.send({
		from: resendCfg.from,
		to: email,
		subject: "管理员登录验证码",
		text: `您的验证码是：${code}\n10 分钟内有效。如非本人操作请忽略。`,
	});

	if (sendErr) {
		return NextResponse.json({ error: "Could not send email" }, { status: 502 });
	}

	return NextResponse.json(neutralMessage);
}
