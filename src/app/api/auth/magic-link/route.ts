import { NextResponse, type NextRequest } from "next/server";

import { consumeMagicLink } from "@/lib/auth/magic-link";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

function resolveNextPath(request: NextRequest): string {
	const next = request.nextUrl.searchParams.get("next");
	if (next && next.startsWith("/") && !next.startsWith("//")) return next;
	return "/my-learning";
}

export async function GET(request: NextRequest) {
	const token = request.nextUrl.searchParams.get("token")?.trim();
	if (!token) {
		return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
	}

	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
	}

	const destination = resolveNextPath(request);
	const response = NextResponse.redirect(new URL(destination, request.url));
	const result = await consumeMagicLink(srv, request, response, token);
	if (!result.ok) {
		return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
	}
	return response;
}
