import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { verifyOtp } from "@/lib/auth/admin-otp";
import {
	getUserIdByEmail,
	profileExistsForEmail,
	registerUserAndSession,
	signInExistingUserWithFreshPassword,
} from "@/lib/auth/auto-register";
import { normalizeRegisterBody, type RegisterPayload } from "@/lib/auth/register-payload";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

const baseSchema = z.object({
	email: z.string().email(),
	code: z.string().trim().min(6).max(6),
	intent: z.enum(["register", "login"]),
});

function isEmailAlreadyRegisteredMessage(msg: string | undefined): boolean {
	if (!msg) return false;
	const m = msg.toLowerCase();
	return (
		msg.includes("已注册") ||
		m.includes("already been registered") ||
		m.includes("already registered") ||
		m.includes("user already registered") ||
		m.includes("email_exists") ||
		m.includes("email address already")
	);
}

export async function POST(request: NextRequest) {
	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ success: false, error: "服务端未配置 SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });
	}

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
	}

	const parsedBase = baseSchema.safeParse(raw);
	if (!parsedBase.success) {
		return NextResponse.json({ success: false, error: "请填写邮箱、6 位验证码与用途" }, { status: 400 });
	}

	const email = parsedBase.data.email.trim().toLowerCase();
	const { code, intent } = parsedBase.data;

	let registerPayload: RegisterPayload | null = null;
	if (intent === "register") {
		const normalized = normalizeRegisterBody(raw);
		if (!normalized.ok) {
			return NextResponse.json(
				{ success: false, error: "请填写昵称与交易偏好等信息", code: "VALIDATION_ERROR" },
				{ status: 400 },
			);
		}
		if (normalized.payload.email.toLowerCase() !== email) {
			return NextResponse.json({ success: false, error: "邮箱与验证码邮箱不一致" }, { status: 400 });
		}
		registerPayload = normalized.payload;
	}

	const { data: row, error: selErr } = await srv
		.from("email_verification_codes")
		.select("id, code_hash, expires_at")
		.eq("email", email)
		.eq("intent", intent)
		.order("created_at", { ascending: false })
		.limit(1)
		.maybeSingle();

	if (selErr || !row) {
		return NextResponse.json({ success: false, error: "验证码无效或已过期，请重新获取" }, { status: 400 });
	}

	const expiresAt = new Date(row.expires_at as string).getTime();
	if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
		await srv.from("email_verification_codes").delete().eq("id", row.id as string);
		return NextResponse.json({ success: false, error: "验证码已过期，请重新获取" }, { status: 400 });
	}

	const hash = row.code_hash as string;
	if (!(await verifyOtp(email, code, hash))) {
		return NextResponse.json({ success: false, error: "验证码错误" }, { status: 400 });
	}

	await srv.from("email_verification_codes").delete().eq("id", row.id as string);

	if (intent === "register") {
		const exists = await profileExistsForEmail(srv, email);
		if (exists) {
			return NextResponse.json(
				{
					success: false,
					error: "该邮箱已注册，请直接登录",
					errorEn: "This email is already registered. Please sign in instead.",
					code: "EMAIL_TAKEN",
				},
				{ status: 409 },
			);
		}

		const reg = await registerUserAndSession(srv, request, registerPayload!);
		if (!reg.ok) {
			const status = reg.status ?? 500;
			if (reg.error && isEmailAlreadyRegisteredMessage(reg.error)) {
				return NextResponse.json(
					{
						success: false,
						error: "该邮箱已注册，请直接登录",
						errorEn: "This email is already registered. Please sign in instead.",
						code: "EMAIL_TAKEN",
					},
					{ status: 409 },
				);
			}
			return NextResponse.json({ success: false, error: reg.error, code: reg.code }, { status });
		}

		return reg.response;
	}

	// login
	const userId = await getUserIdByEmail(srv, email);
	if (!userId) {
		return NextResponse.json({ success: false, error: "该邮箱尚未注册" }, { status: 404 });
	}

	const sign = await signInExistingUserWithFreshPassword(srv, request, email, userId);
	if (!sign.ok) {
		return NextResponse.json({ success: false, error: sign.error, code: sign.code }, { status: sign.status ?? 500 });
	}

	return sign.response;
}
