import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { registerUserAndSession, signInExistingUserWithFreshPassword } from "@/lib/auth/auto-register";
import { isDevTestLoginEnabled } from "@/lib/auth/dev-test-login-enabled.mjs";
import { getTradeUserIdByEmail } from "@/lib/auth/profile-resolve";
import type { RegisterPayload } from "@/lib/auth/register-payload";
import { getOrCreateSimAccount } from "@/lib/trade/sim-account";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

const bodySchema = z.object({
	account: z.enum(["kk", "william", "mark"]),
	password: z.string().min(1),
});

const DEV_TEST_PASSWORD = "123456";

const DEV_TEST_ACCOUNT_EMAIL: Record<"kk" | "william" | "mark", string> = {
	kk: "kk@hkfac.com",
	william: "william@hkfac.com",
	mark: "mark@hkfac.com",
};

export async function GET() {
	return NextResponse.json({
		success: true,
		enabled: isDevTestLoginEnabled(),
	});
}

function buildRegisterPayload(account: "kk" | "william" | "mark", email: string): RegisterPayload {
	return {
		email,
		nickname: account,
		realName: account,
		phone: null,
		tradingExperience: "none",
		tradingStylePreferences: ["undecided"],
		learningGoals: null,
		willingToRecommend: false,
	};
}

async function createDevTestUserWithMinimalProfile(
	srv: NonNullable<ReturnType<typeof getServiceSupabase>>,
	account: "kk" | "william" | "mark",
	email: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string; code: string }> {
	const payload = buildRegisterPayload(account, email);
	const realName = payload.realName?.trim() || null;

	const { data: created, error: createErr } = await srv.auth.admin.createUser({
		email,
		password: DEV_TEST_PASSWORD,
		email_confirm: true,
		user_metadata: {
			nickname: payload.nickname,
			full_name: realName ?? undefined,
			real_name: realName ?? undefined,
		},
	});

	if (createErr || !created?.user) {
		return { ok: false, error: createErr?.message ?? "创建测试账号失败", code: "DEV_TEST_AUTH_CREATE_FAILED" };
	}

	const userId = created.user.id;
	const { error: profileErr } = await srv.from("profiles").upsert(
		{
			id: userId,
			nickname: payload.nickname,
			real_name: realName,
			phone: payload.phone ?? null,
			trading_experience: payload.tradingExperience,
			trading_style_preferences: payload.tradingStylePreferences,
			learning_goals: payload.learningGoals ?? null,
			willing_to_recommend: payload.willingToRecommend,
			role: "user" as const,
		},
		{ onConflict: "id" },
	);
	if (profileErr) {
		await srv.auth.admin.deleteUser(userId);
		return { ok: false, error: profileErr.message, code: "DEV_TEST_PROFILE_UPSERT_FAILED" };
	}

	const sim = await getOrCreateSimAccount(srv, userId);
	if (sim.error) {
		await srv.auth.admin.deleteUser(userId);
		return { ok: false, error: sim.error.message ?? "初始化模拟账户失败", code: "DEV_TEST_SIM_CREATE_FAILED" };
	}

	return { ok: true, userId };
}

export async function POST(request: NextRequest) {
	if (!isDevTestLoginEnabled()) {
		return NextResponse.json(
			{
				success: false,
				error: "Not found",
				code: "DEV_TEST_LOGIN_DISABLED",
			},
			{ status: 404 },
		);
	}

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

	const parsed = bodySchema.safeParse(raw);
	if (!parsed.success) {
		return NextResponse.json({ success: false, error: "参数错误" }, { status: 400 });
	}

	if (parsed.data.password !== DEV_TEST_PASSWORD) {
		return NextResponse.json(
			{
				success: false,
				error: "账号或密码错误",
				errorEn: "Invalid account or password",
				code: "INVALID_DEV_PASSWORD",
			},
			{ status: 401 },
		);
	}

	const email = DEV_TEST_ACCOUNT_EMAIL[parsed.data.account];
	const userId = await getTradeUserIdByEmail(srv, email);

	if (!userId) {
		const reg = await registerUserAndSession(srv, request, buildRegisterPayload(parsed.data.account, email));
		if (!reg.ok) {
			const legacySchemaMissingUserId = reg.code === "PGRST204";

			if (!legacySchemaMissingUserId) {
				return NextResponse.json(
					{ success: false, error: "创建测试账号失败，请稍后重试", code: reg.code ?? "DEV_TEST_REGISTER_FAILED" },
					{ status: reg.status ?? 500 },
				);
			}

			const fallback = await createDevTestUserWithMinimalProfile(srv, parsed.data.account, email);
			if (!fallback.ok) {
				return NextResponse.json(
					{
						success: false,
						error: "创建测试账号失败，请稍后重试",
						code: fallback.code,
					},
					{ status: 500 },
				);
			}

			const sign = await signInExistingUserWithFreshPassword(srv, request, email, fallback.userId);
			if (!sign.ok) {
				return NextResponse.json(
					{ success: false, error: "测试账号登录失败，请稍后重试", code: sign.code ?? "DEV_TEST_SIGNIN_FAILED" },
					{ status: sign.status ?? 500 },
				);
			}

			return sign.response;
		}
		return reg.response;
	}

	const sign = await signInExistingUserWithFreshPassword(srv, request, email, userId);
	if (!sign.ok) {
		return NextResponse.json(
			{ success: false, error: "测试账号登录失败，请稍后重试", code: sign.code ?? "DEV_TEST_SIGNIN_FAILED" },
			{ status: sign.status ?? 500 },
		);
	}

	return sign.response;
}
