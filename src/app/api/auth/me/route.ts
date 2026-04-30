import { NextResponse } from "next/server";

import { maybeAwardDailyLogin } from "@/lib/membership/points";
import { getServiceSupabase } from "@/lib/supabase/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type MeResponse = {
	success: true;
	loggedIn: boolean;
	userId: string | null;
	email: string | null;
	nickname: string | null;
	hasEnrollment: boolean;
};

function nicknameFromMeta(meta: unknown): string {
	if (!meta || typeof meta !== "object") return "";
	const map = meta as Record<string, unknown>;
	const candidates = [map.nickname, map.full_name, map.real_name];
	for (const item of candidates) {
		if (typeof item === "string" && item.trim()) return item.trim();
	}
	return "";
}

function emailPrefix(email: string): string {
	const at = email.indexOf("@");
	const raw = at > 0 ? email.slice(0, at) : email;
	return raw.trim() || "用户";
}

export async function GET() {
	let supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
	try {
		supabase = await createServerSupabaseClient();
	} catch {
		const payload: MeResponse = {
			success: true,
			loggedIn: false,
			userId: null,
			email: null,
			nickname: null,
			hasEnrollment: false,
		};
		return NextResponse.json(payload, { status: 200 });
	}

	const {
		data: { user },
		error: userErr,
	} = await supabase.auth.getUser();

	if (userErr || !user) {
		const payload: MeResponse = {
			success: true,
			loggedIn: false,
			userId: null,
			email: null,
			nickname: null,
			hasEnrollment: false,
		};
		return NextResponse.json(payload, { status: 200 });
	}

	const userId = user.id;
	const email = String(user.email ?? "").trim().toLowerCase() || null;
	const srv = getServiceSupabase();
	if (srv) {
		try {
			await maybeAwardDailyLogin(srv, userId);
		} catch {
			// 积分奖励失败不影响主流程
		}
	}

	const [{ data: profile }, { data: enrollment }] = await Promise.all([
		supabase.from("profiles").select("nickname").eq("id", userId).maybeSingle(),
		supabase.from("registrations").select("id").eq("user_id", userId).maybeSingle(),
	]);

	const nickname =
		(typeof profile?.nickname === "string" && profile.nickname.trim()) ||
		nicknameFromMeta(user.user_metadata) ||
		(email ? emailPrefix(email) : "用户");

	const payload: MeResponse = {
		success: true,
		loggedIn: true,
		userId,
		email,
		nickname,
		hasEnrollment: !!enrollment,
	};

	return NextResponse.json(payload, { status: 200 });
}
