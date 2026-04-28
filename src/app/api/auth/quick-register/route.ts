/**
 * 一键注册（免邮箱验证码）。仅建议在开发/内测阶段启用。
 * 上架生产前宜改回 OTP 注册流程；临时禁用可删除本路由或取消前端对该 API 的调用。
 */
import { NextResponse, type NextRequest } from "next/server";

import { registerUserAndSession } from "@/lib/auth/auto-register";
import { tradeUserExistsForEmail } from "@/lib/auth/profile-resolve";
import { normalizeRegisterBody } from "@/lib/auth/register-payload";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

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

	const normalized = normalizeRegisterBody(raw);
	if (!normalized.ok) {
		return NextResponse.json(
			{ success: false, error: "请填写昵称、邮箱与交易偏好等信息", code: "VALIDATION_ERROR" },
			{ status: 400 },
		);
	}

	const email = normalized.payload.email.toLowerCase();
	const exists = await tradeUserExistsForEmail(srv, email);
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

	const reg = await registerUserAndSession(srv, request, normalized.payload);
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
		return NextResponse.json({ success: false, error: reg.error ?? "注册失败", code: reg.code }, { status });
	}

	return reg.response;
}
