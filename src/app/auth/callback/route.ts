import { NextResponse, type NextRequest } from "next/server";

import {
	buildCanonicalHandoffUrl,
	needsOverseasSessionHandoff,
	sanitizeNextPath,
	signSessionHandoff,
} from "@/lib/auth/session-handoff";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getOrCreateSimAccount } from "@/lib/trade/sim-account";

/** Google OAuth / OTP 回调后在此处建立服务端会话 */
export async function GET(request: NextRequest) {
	const url = request.nextUrl;
	const code = url.searchParams.get("code");
	const next = sanitizeNextPath(url.searchParams.get("next"));
	const hostname = request.headers.get("host")?.split(":")[0] ?? url.hostname;

	if (code) {
		try {
			const supabase = await createServerSupabaseClient();
			const { data, error } = await supabase.auth.exchangeCodeForSession(code);
			if (error || !data.session?.access_token || !data.session.refresh_token) {
				console.error("[auth/callback]", error?.message ?? "empty session after code exchange");
				return NextResponse.redirect(new URL("/login?error=oauth_failed", url.origin));
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

			if (needsOverseasSessionHandoff(hostname)) {
				try {
					const ticket = await signSessionHandoff({
						accessToken: data.session.access_token,
						refreshToken: data.session.refresh_token,
						nextPath: next,
					});
					console.log("[auth/callback] handing off Google session to canonical host");
					return NextResponse.redirect(buildCanonicalHandoffUrl(ticket, next));
				} catch (handoffError) {
					console.error("[auth/callback handoff]", handoffError);
					return NextResponse.redirect(new URL("/login?error=oauth_failed", url.origin));
				}
			}

			return NextResponse.redirect(new URL(next, url.origin));
		} catch (e) {
			console.error(e);
			return NextResponse.redirect(new URL("/login?error=oauth_failed", url.origin));
		}
	}

	return NextResponse.redirect(new URL("/login", url.origin));
}
