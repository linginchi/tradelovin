import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decodeJwt } from "jose";

import { sanitizeNextPath, verifySessionHandoff } from "@/lib/auth/session-handoff";
import { writeSupabaseSessionCookies } from "@/lib/supabase/session";

export const runtime = "nodejs";

/** Completes a cross-domain session handoff onto the canonical overseas host. */
export async function GET(request: NextRequest) {
	const ticket = request.nextUrl.searchParams.get("ticket")?.trim();
	const nextPath = sanitizeNextPath(request.nextUrl.searchParams.get("next"));
	if (!ticket) {
		return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
	}

	try {
		const payload = await verifySessionHandoff(ticket);
		const destination = sanitizeNextPath(payload.nextPath || nextPath);
		const response = NextResponse.redirect(new URL(destination, request.url));

		const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
		const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
		if (!url || !anon) {
			throw new Error("Missing NEXT_PUBLIC Supabase env");
		}
		const anonClient = createClient(url, anon, {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		});
		const { data: userData, error: userErr } = await anonClient.auth.getUser(payload.accessToken);
		if (userErr || !userData.user) {
			console.error("[auth/handoff] getUser failed", userErr?.message ?? "empty user");
			return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
		}

		const claims = decodeJwt(payload.accessToken);
		const expiresAt = typeof claims.exp === "number" ? claims.exp : undefined;
		const now = Math.floor(Date.now() / 1000);
		writeSupabaseSessionCookies(response, {
			access_token: payload.accessToken,
			refresh_token: payload.refreshToken,
			expires_at: expiresAt,
			expires_in: expiresAt ? Math.max(0, expiresAt - now) : undefined,
			token_type: "bearer",
			user: userData.user,
		});
		return response;
	} catch (error) {
		console.error("[auth/handoff]", error instanceof Error ? error.message : error);
		return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
	}
}
