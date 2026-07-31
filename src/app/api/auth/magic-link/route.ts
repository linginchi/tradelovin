import { NextResponse, type NextRequest } from "next/server";

import { consumeMagicLink } from "@/lib/auth/magic-link";
import {
	buildCanonicalHandoffUrl,
	needsOverseasSessionHandoff,
	sanitizeNextPath,
	signSessionHandoff,
} from "@/lib/auth/session-handoff";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
	console.log("[magic-link callback] start", {
		hasToken: Boolean(request.nextUrl.searchParams.get("token")?.trim()),
		next: request.nextUrl.searchParams.get("next"),
	});
	const token = request.nextUrl.searchParams.get("token")?.trim();
	if (!token) {
		console.warn("[magic-link callback] missing token");
		return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
	}

	const srv = getServiceSupabase();
	if (!srv) {
		console.error("[magic-link callback] service supabase unavailable");
		return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
	}

	const destination = sanitizeNextPath(request.nextUrl.searchParams.get("next"));
	console.log("[magic-link callback] destination resolved", { destination });
	const response = NextResponse.redirect(new URL(destination, request.url));
	const result = await consumeMagicLink(srv, request, response, token);
	if (!result.ok) {
		console.warn("[magic-link callback] consume failed");
		return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
	}

	const hostname = request.headers.get("host")?.split(":")[0] ?? "";
	if (needsOverseasSessionHandoff(hostname)) {
		try {
			const ticket = await signSessionHandoff({
				accessToken: result.accessToken,
				refreshToken: result.refreshToken,
				nextPath: destination,
			});
			console.log("[magic-link callback] handing off session to canonical host");
			return NextResponse.redirect(buildCanonicalHandoffUrl(ticket, destination));
		} catch (error) {
			console.error("[magic-link callback] handoff failed", error);
			return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
		}
	}

	console.log("[magic-link callback] consume success");
	return response;
}
