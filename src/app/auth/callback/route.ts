import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getOrCreateSimAccount } from "@/lib/trade/sim-account";

/** 魔法链接登录 / OTP 回调后在此处建立服务端会话 */
export async function GET(request: NextRequest) {
	const url = request.nextUrl;
	const code = url.searchParams.get("code");
	const rawNext = url.searchParams.get("next");
	const next =
		rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
			? rawNext
			: "/my-learning";

	if (code) {
		try {
			const supabase = await createServerSupabaseClient();
			const { error } = await supabase.auth.exchangeCodeForSession(code);
			if (error) {
				console.error("[auth/callback]", error.message);
				return NextResponse.redirect(new URL("/register?auth=fail", url.origin));
			}
			const {
				data: { user },
			} = await supabase.auth.getUser();
			if (user?.id) {
				const srv = getServiceSupabase();
				if (srv) {
					const emailLower = (user.email ?? "").trim().toLowerCase();
					const nickFromMeta =
						(typeof user.user_metadata?.nickname === "string" && user.user_metadata.nickname.trim()) ||
						(typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) ||
						(typeof user.user_metadata?.name === "string" && user.user_metadata.name.trim()) ||
						(emailLower.split("@")[0] ?? "学员");
					const profileRes = await srv.from("profiles").upsert(
						{
							id: user.id,
							nickname: nickFromMeta || "学员",
							role: "user",
						},
						{ onConflict: "id" },
					);
					if (profileRes.error) {
						console.error("[auth/callback profile upsert]", profileRes.error.message);
					}
					const sim = await getOrCreateSimAccount(srv, user.id);
					if (sim.error) {
						console.error("[auth/callback sim init]", sim.error.message);
					}
				}
			}
			return NextResponse.redirect(new URL(next, url.origin));
		} catch (e) {
			console.error(e);
			return NextResponse.redirect(new URL("/register?auth=fail", url.origin));
		}
	}

	return NextResponse.redirect(new URL("/register", url.origin));
}
