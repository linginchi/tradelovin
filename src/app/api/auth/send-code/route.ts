import { Resend } from "resend";
import { NextResponse } from "next/server";
import { z } from "zod";

import { generateOtpCode, hashOtp } from "@/lib/auth/admin-otp";
import { tradeUserExistsForEmail } from "@/lib/auth/profile-resolve";
import { resolveResendEnv } from "@/lib/email/resend-config";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/security/rate-limit";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

function isOtpBypassEnabled(): boolean {
	const enabled = process.env.BYPASS_EMAIL_VERIFICATION === "true";
	return enabled && process.env.NODE_ENV !== "production";
}

const bodySchema = z.object({
	email: z.string().email(),
	intent: z.enum(["register", "login"]),
});

const EMAIL_EXISTS_MSG_CN = "该邮箱已注册，请直接登录";
const EMAIL_EXISTS_MSG_EN =
	"This email is already registered. Please sign in instead.";

const EMAIL_NOT_FOUND_MSG_CN = "该邮箱尚未注册，请先注册";
const EMAIL_NOT_FOUND_MSG_EN = "This email is not registered yet. Please sign up first.";

export async function POST(req: Request) {
	const bypassEmail = isOtpBypassEnabled();
	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ success: false, error: "服务端未配置 SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });
	}

	let json: unknown;
	try {
		json = await req.json();
	} catch {
		return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
	}

	const parsed = bodySchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ success: false, error: "请提供有效邮箱与用途" }, { status: 400 });
	}

	const email = parsed.data.email.trim().toLowerCase();
	const { intent } = parsed.data;
	const ip = clientIpFromHeaders(req.headers);

	const perIp = checkRateLimit({
		bucket: "auth-send-code-ip",
		key: ip,
		windowMs: 10 * 60 * 1000,
		maxHits: 12,
	});
	if (perIp.limited) {
		return NextResponse.json(
			{ success: false, error: "请求过于频繁，请稍后重试", code: "RATE_LIMITED" },
			{ status: 429, headers: { "Retry-After": String(perIp.retryAfterSec) } },
		);
	}

	const perEmail = checkRateLimit({
		bucket: "auth-send-code-email",
		key: `${intent}:${email}`,
		windowMs: 10 * 60 * 1000,
		maxHits: 4,
	});
	if (perEmail.limited) {
		return NextResponse.json(
			{ success: false, error: "请求过于频繁，请稍后重试", code: "RATE_LIMITED" },
			{ status: 429, headers: { "Retry-After": String(perEmail.retryAfterSec) } },
		);
	}

	const exists = await tradeUserExistsForEmail(srv, email);

	if (intent === "register" && exists) {
		return NextResponse.json(
			{
				success: false,
				error: EMAIL_EXISTS_MSG_CN,
				errorEn: EMAIL_EXISTS_MSG_EN,
				code: "EMAIL_TAKEN",
			},
			{ status: 409 },
		);
	}

	if (intent === "login" && !exists) {
		return NextResponse.json(
			{
				success: false,
				error: EMAIL_NOT_FOUND_MSG_CN,
				errorEn: EMAIL_NOT_FOUND_MSG_EN,
				code: "EMAIL_NOT_FOUND",
			},
			{ status: 404 },
		);
	}

	const code = generateOtpCode();
	const codeHash = await hashOtp(email, code);
	const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

	await srv.from("email_verification_codes").delete().eq("email", email).eq("intent", intent);

	const { error: insertErr } = await srv.from("email_verification_codes").insert({
		email,
		code_hash: codeHash,
		intent,
		expires_at: expiresAt,
	});

	if (insertErr) {
		console.error("[send-code insert]", insertErr);
		return NextResponse.json({ success: false, error: "无法创建验证码" }, { status: 500 });
	}

	if (bypassEmail) {
		return NextResponse.json({
			success: true,
			bypass: true,
			message: "验证码已生成（调试模式），请直接输入验证码完成验证",
			devCode: code,
		});
	}

	const resendCfg = resolveResendEnv();
	if (!resendCfg.ok) {
		return NextResponse.json(
			{
				success: false,
				code: "EMAIL_PROVIDER_MISCONFIGURED",
				error: "邮件服务暂不可用，请稍后重试",
				errorEn: "Email service is temporarily unavailable. Please try again later.",
			},
			{ status: 503 },
		);
	}

	const resend = new Resend(resendCfg.apiKey);
	const { error: sendErr } = await resend.emails.send({
		from: resendCfg.from,
		to: email,
		subject: intent === "register" ? "TradeLovin 注册验证码" : "TradeLovin 登录验证码",
		text: `您的验证码是：${code}\n10 分钟内有效。如非本人操作请忽略。`,
	});

	if (sendErr) {
		return NextResponse.json({ success: false, error: "邮件发送失败" }, { status: 502 });
	}

	return NextResponse.json({ success: true, message: "验证码已发送" });
}
