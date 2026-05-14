import { NextResponse } from "next/server";

import { ADMIN_TOKEN_COOKIE } from "@/lib/auth/admin-session";
import { getServiceSupabase } from "@/lib/supabase/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** 允许未登录调用，用于清除已过期的 HttpOnly cookie */
export async function POST() {
	const res = NextResponse.json({ ok: true });

	try {
		const supabase = await createServerSupabaseClient();
		const {
			data: { user },
		} = await supabase.auth.getUser();
		if (user?.email) {
			const email = user.email.trim().toLowerCase();
			const srv = getServiceSupabase();
			if (srv) {
				const { data: profile } = await srv.from("profiles").select("role").eq("id", user.id).maybeSingle();
				if (String(profile?.role ?? "").toLowerCase() === "super_admin") {
					await supabase.auth.signOut();
				}
			}
		}
	} catch {
		// ignore
	}

	res.cookies.set(ADMIN_TOKEN_COOKIE, "", {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		path: "/",
		maxAge: 0,
	});
	return res;
}
