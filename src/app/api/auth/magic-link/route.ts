import { NextResponse, type NextRequest } from "next/server";

import { consumeMagicLink } from "@/lib/auth/magic-link";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

function resolveNextPath(request: NextRequest): string {
	const next = request.nextUrl.searchParams.get("next");
	if (next && next.startsWith("/") && !next.startsWith("//")) return next;
	return "/courses";
}

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

	const destination = resolveNextPath(request);
	console.log("[magic-link callback] destination resolved", { destination });
	const response = NextResponse.redirect(new URL(destination, request.url));
	const result = await consumeMagicLink(srv, request, response, token);
	if (!result.ok) {
		console.warn("[magic-link callback] consume failed");
		return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
	}
	console.log("[magic-link callback] consume success");
	return response;
}
