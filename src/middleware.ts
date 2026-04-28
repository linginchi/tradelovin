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

	/* guo3guan.com：默认入口为繁体（zh-TW）；tradelovin.com / 其余域名仍为 defaultLocale（zh）。
	 * localePrefix=as-needed 时简体无前缀 /trade，仅用「是否已为 /zh-TW 或 /en」判断。
	 */
	const host = request.headers.get("host") ?? "";
	if (host.includes("guo3guan.com")) {
		const explicitTw =
			pathname === "/zh-TW" || pathname.startsWith("/zh-TW/");
		const explicitEn = pathname === "/en" || pathname.startsWith("/en/");

		/* 显式简体中文路径（/zh、/zh/xxx）映射为同一地址的 zh-TW，避免前缀叠成 /zh-TW/zh/... */
		const zhPrefix =
			pathname === "/zh" ||
			pathname === "/zh/" ||
			pathname.startsWith("/zh/");
		if (!explicitTw && zhPrefix) {
			const tail =
				pathname === "/zh" || pathname === "/zh/"
					? ""
					: pathname.slice("/zh".length);
			const url = request.nextUrl.clone();
			url.pathname = tail === "" ? "/zh-TW" : `/zh-TW${tail}`;
			return NextResponse.redirect(url);
		}

		if (!explicitTw && !explicitEn && !zhPrefix) {
			const url = request.nextUrl.clone();
			url.pathname =
				pathname === "/" ? "/zh-TW" : `/zh-TW${pathname}`;
			return NextResponse.redirect(url);
		}
	}

	return intlMiddleware(request);
}

export const config = {
	matcher: ["/((?!api|_next|_vercel|auth|.*\\..*).*)"],
};
