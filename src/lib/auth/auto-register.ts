import { randomBytes } from "node:crypto";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import type { RegisterPayload } from "@/lib/auth/register-payload";
import { mapRegistrationInsertError } from "@/lib/auth/registration-db-errors";
import { getOrCreateSimAccount } from "@/lib/trade/sim-account";
import { withPersistentSessionCookieOptions } from "@/lib/supabase/session";

export function randomInternalPassword(): string {
	const raw = randomBytes(32).toString("base64url");
	return `Aa9!${raw}`;
}

export function createSupabaseRouteClient(request: NextRequest, response: NextResponse) {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
	if (!url || !anon) {
		throw new Error("Missing NEXT_PUBLIC Supabase env");
	}
	return createServerClient(url, anon, {
		cookies: {
			getAll() {
				return request.cookies.getAll();
			},
			setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
				for (const { name, value, options } of cookiesToSet) {
					response.cookies.set(name, value, {
						...withPersistentSessionCookieOptions(options),
						path: "/",
						sameSite: "lax",
					});
				}
			},
		},
	});
}

export type RegisterAndSessionResult =
	| { ok: true; userId: string; response: NextResponse }
	| { ok: false; error: string; code?: string; status?: number };

/**
 * 注册/手动建号失败时：先删 `registrations` / `sim_accounts` / `profiles`，再删 auth 用户，
 * 避免仅删 auth 导致 public 表孤儿行（无 FK CASCADE 时）。
 */
export async function rollbackTradeUserOnboarding(srv: SupabaseClient, userId: string): Promise<void> {
	await srv.from("registrations").delete().eq("user_id", userId);
	await srv.from("sim_accounts").delete().eq("user_id", userId);
	await srv.from("profiles").delete().eq("id", userId);
	await srv.auth.admin.deleteUser(userId);
}

/** 新建 auth 用户、profiles（insert，冲突则 upsert）、registrations、sim_accounts，并写入会话 Cookie。 */
export async function registerUserAndSession(
	srv: SupabaseClient,
	request: NextRequest,
	payload: RegisterPayload,
): Promise<RegisterAndSessionResult> {
	const emailLower = payload.email.toLowerCase();
	const password = randomInternalPassword();
	const realName = payload.realName?.trim() || undefined;

	const { data: created, error: createErr } = await srv.auth.admin.createUser({
		email: emailLower,
		password,
		email_confirm: true,
		user_metadata: {
			nickname: payload.nickname,
			full_name: realName,
			real_name: realName,
			phone: payload.phone ?? undefined,
		},
	});

	if (createErr?.message || !created?.user) {
		return {
			ok: false,
			error: createErr?.message ?? "创建用户失败",
			code: "AUTH_CREATE_FAILED",
			status: 400,
		};
	}

	const userId = created.user.id;

	const profileRow = {
		id: userId,
		nickname: payload.nickname,
		real_name: realName ?? null,
		phone: payload.phone ?? null,
		trading_experience: payload.tradingExperience,
		trading_style_preferences: payload.tradingStylePreferences,
		learning_goals: payload.learningGoals ?? null,
		willing_to_recommend: payload.willingToRecommend,
		role: "user" as const,
	};

	const { error: insertErr } = await srv.from("profiles").insert(profileRow);

	if (insertErr) {
		const isDup = insertErr.code === "23505";
		if (!isDup) {
			console.error("[register profiles insert]", insertErr);
			await rollbackTradeUserOnboarding(srv, userId);
			return { ok: false, error: insertErr.message, status: 500 };
		}

		const { error: upsertErr } = await srv.from("profiles").upsert(
			{
				...profileRow,
			},
			{ onConflict: "id" },
		);
		if (upsertErr) {
			console.error("[register profiles upsert]", upsertErr);
			await rollbackTradeUserOnboarding(srv, userId);
			return { ok: false, error: upsertErr.message, status: 500 };
		}
	}

	const simRes = await getOrCreateSimAccount(srv, userId);
	if (simRes.error) {
		console.error("[register sim]", simRes.error);
		await rollbackTradeUserOnboarding(srv, userId);
		return { ok: false, error: simRes.error.message ?? "模拟账户初始化失败", status: 500 };
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
		await rollbackTradeUserOnboarding(srv, userId);
		return {
			ok: false,
			error: mapRegistrationInsertError(regErr.message),
			code: regErr.code ?? "REGISTRATION_INSERT_FAILED",
			status: 500,
		};
	}

	const response = NextResponse.json({
		success: true,
		message: "注册成功",
		data: { userId },
	});

	const cookieClient = createSupabaseRouteClient(request, response);
	const { error: signErr } = await cookieClient.auth.signInWithPassword({
		email: emailLower,
		password,
	});

	if (signErr) {
		console.error("[register signIn]", signErr.message);
		await rollbackTradeUserOnboarding(srv, userId);
		return { ok: false, error: "会话建立失败：" + signErr.message, status: 500 };
	}

	return { ok: true, userId, response };
}

/** 已存在用户：建立浏览器会话（不轮换密码，避免覆盖用户自设密码）。 */
export async function signInExistingUserWithFreshPassword(
	srv: SupabaseClient,
	request: NextRequest,
	emailLower: string,
	userId: string,
): Promise<RegisterAndSessionResult> {
	const response = NextResponse.json({
		success: true,
		message: "登录成功",
		data: { userId },
	});

	const { data: linkData, error: linkErr } = await srv.auth.admin.generateLink({
		type: "magiclink",
		email: emailLower,
	});
	const tokenHash = linkData?.properties?.hashed_token;
	if (linkErr || !tokenHash) {
		return {
			ok: false,
			error: linkErr?.message ?? "无法创建登录会话",
			status: 500,
		};
	}

	const cookieClient = createSupabaseRouteClient(request, response);
	const { error: otpErr } = await cookieClient.auth.verifyOtp({
		token_hash: tokenHash,
		type: "email",
	});
	if (otpErr) {
		return { ok: false, error: "会话建立失败：" + otpErr.message, status: 500 };
	}

	return { ok: true, userId, response };
}
