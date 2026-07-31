import { cookies, headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { parseCookieHeader } from "@supabase/ssr";
import { NextResponse } from "next/server";

import { maybeAwardDailyLogin } from "@/lib/membership/points";
import { getServiceSupabase } from "@/lib/supabase/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { readAccessTokenFromCookies } from "@/lib/supabase/session";

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

async function resolveAuthedUser() {
	try {
		const supabase = await createServerSupabaseClient();
		const {
			data: { user },
			error: userErr,
		} = await supabase.auth.getUser();
		if (!userErr && user) return { supabase, user };
	} catch {
		// fall through to Cookie-header path
	}

	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
	if (!url || !anon) return null;

	const cookieStore = await cookies();
	const headerStore = await headers();
	const fromStore = cookieStore.getAll();
	const fromHeader = parseCookieHeader(headerStore.get("cookie") ?? "");
	const merged = new Map<string, string>();
	for (const c of fromHeader) merged.set(c.name, c.value);
	for (const c of fromStore) merged.set(c.name, c.value);
	const accessToken = await readAccessTokenFromCookies(
		[...merged.entries()].map(([name, value]) => ({ name, value })),
		url,
	);
	if (!accessToken) return null;

	const supabase = createClient(url, anon, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
	});
	const {
		data: { user },
		error: userErr,
	} = await supabase.auth.getUser(accessToken);
	if (userErr || !user) return null;
	return { supabase, user };
}

export async function GET() {
	const resolved = await resolveAuthedUser();
	if (!resolved) {
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
	const { supabase, user } = resolved;

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
