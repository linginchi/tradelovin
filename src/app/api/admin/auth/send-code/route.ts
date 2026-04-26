import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";

import { generateOtpCode, hashOtp } from "@/lib/auth/admin-otp";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "edge";

const bodySchema = z.object({
	email: z.string().email(),
});

export async function POST(req: Request) {
	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

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
	const { data: admin } = await supabase
		.from("admins")
		.select("email")
		.eq("email", email)
		.maybeSingle();

	// 统一响应，避免枚举哪些邮箱是管理员
	const neutralMessage = { ok: true as const, message: "If this email is authorized, a code was sent." };

	if (!admin) {
		return NextResponse.json(neutralMessage);
	}

	const resendKey = process.env.RESEND_API_KEY;
	const from = process.env.RESEND_FROM_EMAIL;
	if (!resendKey || !from) {
		return NextResponse.json({ error: "Email not configured" }, { status: 503 });
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

	const resend = new Resend(resendKey);
	const { error: sendErr } = await resend.emails.send({
		from,
		to: email,
		subject: "管理员登录验证码",
		text: `您的验证码是：${code}\n10 分钟内有效。如非本人操作请忽略。`,
	});

	if (sendErr) {
		return NextResponse.json({ error: "Could not send email" }, { status: 502 });
	}

	return NextResponse.json(neutralMessage);
}
