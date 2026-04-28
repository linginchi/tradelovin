import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";

import { isAdminPortalEmail } from "@/lib/auth/admin-gate";
import { generateOtpCode, hashOtp } from "@/lib/auth/admin-otp";
import { resolveResendEnv } from "@/lib/email/resend-config";
import { getServiceSupabase } from "@/lib/supabase/service";

const bodySchema = z.object({
	email: z.string().email(),
});

export async function POST(req: Request) {
	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

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

	if (!isAdminPortalEmail(email)) {
		return NextResponse.json(neutralMessage);
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
