import { randomBytes } from "node:crypto";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { normalizeRegisterBody } from "@/lib/auth/register-payload";
import { getOrCreateSimAccount } from "@/lib/trade/sim-account";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

const EMAIL_EXISTS_MSG_CN = "该邮箱已注册，请直接登录";
const EMAIL_EXISTS_MSG_EN =
	"This email is already registered. Please sign in instead.";

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

/** 满足常见的 Supabase 密码复杂度要求（长度 + 大小写 + 数字 + 符号）。 */
function randomInternalPassword(): string {
	const raw = randomBytes(32).toString("base64url");
	return `Aa9!${raw}`;
}

export async function POST(request: NextRequest) {
	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ success: false, error: "服务端未配置 SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });
	}

	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
	if (!url || !anon) {
		return NextResponse.json({ success: false, error: "缺少 NEXT_PUBLIC Supabase 环境变量" }, { status: 503 });
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
			{ success: false, error: "请填写邮箱与昵称，并核对交易偏好格式", code: "VALIDATION_ERROR" },
			{ status: 400 },
		);
	}

	const payload = normalized.payload;
	const emailLower = payload.email.toLowerCase();
	const password = randomInternalPassword();

	const { data: created, error: createErr } = await srv.auth.admin.createUser({
		email: emailLower,
		password,
		email_confirm: true,
		user_metadata: {
			nickname: payload.nickname,
			full_name: payload.realName,
			phone: payload.phone ?? undefined,
		},
	});

	if (createErr?.message || !created?.user) {
		const em = createErr?.message ?? "";
		if (isEmailAlreadyRegisteredMessage(em)) {
			return NextResponse.json(
				{ success: false, error: EMAIL_EXISTS_MSG_CN, errorEn: EMAIL_EXISTS_MSG_EN, code: "EMAIL_TAKEN" },
				{ status: 409 },
			);
		}
		return NextResponse.json(
			{ success: false, error: createErr?.message ?? "创建用户失败", code: "AUTH_CREATE_FAILED" },
			{ status: 400 },
		);
	}

	const userId = created.user.id;

	async function rollbackAuthUser(): Promise<void> {
		await srv!.auth.admin.deleteUser(userId);
	}

	const { error: profileErr } = await srv.from("profiles").upsert(
		{
			id: userId,
			email: emailLower,
			nickname: payload.nickname,
			full_name: payload.realName?.trim() || null,
			phone: payload.phone ?? null,
			role: "user",
			specialties: [],
			is_instructor: false,
		},
		{ onConflict: "id" },
	);

	if (profileErr) {
		console.error("[register profiles]", profileErr);
		await rollbackAuthUser();
		return NextResponse.json({ success: false, error: profileErr.message }, { status: 500 });
	}

	const simRes = await getOrCreateSimAccount(srv, userId);
	if (simRes.error) {
		console.error("[register sim]", simRes.error);
		await rollbackAuthUser();
		return NextResponse.json(
			{ success: false, error: simRes.error.message ?? "模拟账户初始化失败" },
			{ status: 500 },
		);
	}

	const regRow = {
		user_id: userId,
		email: emailLower,
		nickname: payload.nickname,
		real_name: payload.realName,
		phone: payload.phone ?? null,
		trading_experience: payload.tradingExperience,
		trading_style_preferences: payload.tradingStylePreferences,
		learning_goals: payload.learningGoals ?? null,
		willing_to_recommend: payload.willingToRecommend,
		status: "pending" as const,
	};

	const { error: regErr } = await srv.from("registrations").insert(regRow);
	if (regErr) {
		console.error("[register registrations]", regErr);
		await rollbackAuthUser();
		return NextResponse.json({ success: false, error: regErr.message }, { status: 500 });
	}

	const response = NextResponse.json({
		success: true,
		message: "注册成功",
		data: { userId },
	});

	const cookieClient = createServerClient(url, anon, {
		cookies: {
			getAll() {
				return request.cookies.getAll();
			},
			setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
				for (const { name, value, options } of cookiesToSet) {
					response.cookies.set(name, value, options);
				}
			},
		},
	});

	const { error: signErr } = await cookieClient.auth.signInWithPassword({
		email: emailLower,
		password,
	});

	if (signErr) {
		console.error("[register signIn]", signErr.message);
		await rollbackAuthUser();
		return NextResponse.json({ success: false, error: "会话建立失败：" + signErr.message }, { status: 500 });
	}

	return response;
}
