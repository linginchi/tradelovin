import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";

import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;

	if (pathname === "/admin" || pathname.startsWith("/admin/")) {
		return new NextResponse(null, { status: 404 });
	}

	if (/^\/(zh|zh-TW|en)\/admin(\/|$)/.test(pathname)) {
		return new NextResponse(null, { status: 404 });
	}

	if (pathname === "/cjkzt" || pathname.startsWith("/cjkzt/")) {
		return NextResponse.next();
	}

	return intlMiddleware(request);
}

export const config = {
	matcher: ["/((?!api|_next|_vercel|auth|.*\\..*).*)"],
};
