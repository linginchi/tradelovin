import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/auth/auto-register";
import { sanitizeNextPath, verifySessionHandoff } from "@/lib/auth/session-handoff";

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
		const supabase = createSupabaseRouteClient(request, response);
		const { error } = await supabase.auth.setSession({
			access_token: payload.accessToken,
			refresh_token: payload.refreshToken,
		});
		if (error) {
			console.error("[auth/handoff] setSession failed", error.message);
			return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
		}
		return response;
	} catch (error) {
		console.error("[auth/handoff]", error instanceof Error ? error.message : error);
		return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
	}
}
