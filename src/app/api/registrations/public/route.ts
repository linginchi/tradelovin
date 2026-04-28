import { NextResponse } from "next/server";

import { mapRegistrationInsertError, registrationSchemaMismatchMessage } from "@/lib/auth/registration-db-errors";
import { normalizeRegisterBody } from "@/lib/auth/register-payload";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

/**
 * 匿名提交课程报名（无登录）。使用 service_role 写入，避免依赖已收紧的 registrations RLS。
 * 与 {@link RegistrationForm} 字段一致；不写入 user_id（待用户注册后可由业务回填或重复报名策略处理）。
 */
export async function POST(request: Request) {
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

	const p = normalized.payload;
	const row = {
		real_name: p.realName ?? null,
		nickname: p.nickname,
		email: p.email.toLowerCase(),
		phone: p.phone,
		trading_experience: p.tradingExperience,
		trading_style_preferences: p.tradingStylePreferences,
		learning_goals: p.learningGoals,
		willing_to_recommend: p.willingToRecommend,
		status: "pending" as const,
	};

	const { error } = await srv.from("registrations").insert(row);
	if (error) {
		const hint = registrationSchemaMismatchMessage(error.message);
		console.error("[registrations/public]", error.message);
		return NextResponse.json(
			{ success: false, error: mapRegistrationInsertError(error.message), code: hint ? "SCHEMA_MISMATCH" : "INSERT_FAILED" },
			{ status: 500 },
		);
	}

	return NextResponse.json({ success: true, message: "报名已提交" });
}
