import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSuperAdminSession } from "@/lib/auth/admin-api-guard";
import { randomInternalPassword } from "@/lib/auth/auto-register";
import { tradeUserExistsForEmail } from "@/lib/auth/profile-resolve";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getOrCreateSimAccount } from "@/lib/trade/sim-account";

export const runtime = "nodejs";

const bodySchema = z.object({
	email: z.string().trim().email(),
	nickname: z.string().trim().min(1, "nickname required"),
	realName: z.string().trim().optional(),
	phone: z.string().trim().optional(),
});

/**
 * 超级管理员手动创建学员：auth.users + profiles + sim_accounts（不写 registrations）。
 */
export async function POST(req: Request) {
	const gated = await requireSuperAdminSession();
	if (gated instanceof NextResponse) return gated;

	const srvRaw = getServiceSupabase();
	if (!srvRaw) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}
	const srv: SupabaseClient = srvRaw;

	let json: unknown;
	try {
		json = await req.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = bodySchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
	}

	const emailLower = parsed.data.email.toLowerCase();
	const nickname = parsed.data.nickname;
	const realName = parsed.data.realName?.trim() || null;
	const phone = parsed.data.phone?.trim() || null;

	if (await tradeUserExistsForEmail(srv, emailLower)) {
		return NextResponse.json({ error: "Email already exists", code: "EMAIL_TAKEN" }, { status: 409 });
	}

	const password = randomInternalPassword();
	const { data: created, error: createErr } = await srv.auth.admin.createUser({
		email: emailLower,
		password,
		email_confirm: true,
		user_metadata: {
			nickname,
			full_name: realName ?? undefined,
			real_name: realName ?? undefined,
			phone: phone ?? undefined,
		},
	});

	if (createErr?.message || !created?.user) {
		return NextResponse.json(
			{ error: createErr?.message ?? "创建用户失败", code: "AUTH_CREATE_FAILED" },
			{ status: 400 },
		);
	}

	const userId = created.user.id;

	async function rollbackAuthUser(): Promise<void> {
		await srv.auth.admin.deleteUser(userId);
	}

	const profileRow = {
		id: userId,
		nickname,
		real_name: realName,
		phone,
		trading_experience: "none" as const,
		trading_style_preferences: [] as string[],
		learning_goals: null as string | null,
		willing_to_recommend: false,
		role: "user" as const,
	};

	const { error: insertProfErr } = await srv.from("profiles").insert(profileRow);
	if (insertProfErr) {
		const isDup = insertProfErr.code === "23505";
		if (!isDup) {
			console.error("[admin add-user profiles insert]", insertProfErr);
			await rollbackAuthUser();
			return NextResponse.json({ error: insertProfErr.message }, { status: 500 });
		}
		const { error: upsertErr } = await srv.from("profiles").upsert(profileRow, { onConflict: "id" });
		if (upsertErr) {
			console.error("[admin add-user profiles upsert]", upsertErr);
			await rollbackAuthUser();
			return NextResponse.json({ error: upsertErr.message }, { status: 500 });
		}
	}

	const simRes = await getOrCreateSimAccount(srv, userId);
	if (simRes.error) {
		console.error("[admin add-user sim]", simRes.error);
		await rollbackAuthUser();
		return NextResponse.json(
			{ error: simRes.error.message ?? "模拟账户初始化失败" },
			{ status: 500 },
		);
	}

	return NextResponse.json({
		success: true,
		userId,
		message: "用户已创建，可使用该邮箱在登录页通过验证码登录。",
	});
}
