import { NextResponse, type NextRequest } from "next/server";

import { sanitizeNextPath } from "@/lib/auth/session-handoff";

export const runtime = "nodejs";

/**
 * Email links point here. Forward server-side to the API consumer so email
 * link scanners that do not execute JavaScript still hit a single hop, and so
 * we avoid a client-only redirect race.
 */
export async function GET(request: NextRequest) {
	const token = request.nextUrl.searchParams.get("token")?.trim();
	const next = sanitizeNextPath(request.nextUrl.searchParams.get("next"));
	if (!token) {
		return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
	}
	const target = new URL("/api/auth/magic-link", request.url);
	target.searchParams.set("token", token);
	target.searchParams.set("next", next);
	return NextResponse.redirect(target);
}
