import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/** 魔法链接登录 / OTP 回调后在此处建立服务端会话 */
export async function GET(request: NextRequest) {
	const url = request.nextUrl;
	const code = url.searchParams.get("code");
	const next = url.searchParams.get("next") ?? "/trade";

	if (code) {
		try {
			const supabase = await createServerSupabaseClient();
			const { error } = await supabase.auth.exchangeCodeForSession(code);
			if (error) {
				console.error("[auth/callback]", error.message);
				return NextResponse.redirect(new URL("/register?auth=fail", url.origin));
			}
			return NextResponse.redirect(new URL(next, url.origin));
		} catch (e) {
			console.error(e);
			return NextResponse.redirect(new URL("/register?auth=fail", url.origin));
		}
	}

	return NextResponse.redirect(new URL("/register", url.origin));
}
