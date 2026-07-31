import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

import { INVOKE_PATH_HEADER } from "@/lib/invoke-path-header";
import { isHttpsOnlyHost } from "@/lib/site-entries.mjs";
import { buildLegacyOverseasRedirectUrl } from "@/lib/site/legacy-overseas-redirect.mjs";

import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);
/* /courses 与 /video-player 对访客公开，供免费预览播放；其余学习/交易/实验室路径仍需登录 */
const PROTECTED_PATHS = ["/my-learning", "/membership", "/trade", "/trade-v2", "/lab"] as const;

const LEGACY_LEARNING = [
	{ from: "my-courses", to: "my-learning" },
	{ from: "my-scores", to: "my-learning" },
] as const;

const LOCALES = ["zh", "zh-TW", "en"] as const;

/** 供根 layout 设置 `<html lang>`（须写入 request headers，Server Components 才可读） */
function withInvokePath(request: NextRequest): NextResponse {
	const headers = new Headers(request.headers);
	headers.set(INVOKE_PATH_HEADER, request.nextUrl.pathname);
	return NextResponse.next({ request: { headers } });
}

function requestWithInvokePath(request: NextRequest): NextRequest {
	const headers = new Headers(request.headers);
	headers.set(INVOKE_PATH_HEADER, request.nextUrl.pathname);
	return new NextRequest(request.url, { headers });
}

function redirectLegacyLearningPaths(request: NextRequest): NextResponse | null {
	const pathname = request.nextUrl.pathname;
	for (const { from, to } of LEGACY_LEARNING) {
		if (pathname === `/${from}` || pathname.startsWith(`/${from}/`)) {
			const url = request.nextUrl.clone();
			url.pathname = pathname.replace(`/${from}`, `/${to}`);
			return NextResponse.redirect(url, 308);
		}
		for (const loc of LOCALES) {
			const prefix = `/${loc}/${from}`;
			if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
				const url = request.nextUrl.clone();
				url.pathname = pathname.replace(prefix, `/${loc}/${to}`);
				return NextResponse.redirect(url, 308);
			}
		}
	}
	return null;
}

function readEnv(name: string): string {
	const value = process.env[name];
	return typeof value === "string" ? value : "";
}

function isProtectedPath(pathname: string): boolean {
	for (const raw of PROTECTED_PATHS) {
		const root = raw.replace(/\/$/, "");
		if (pathname === root || pathname.startsWith(`${root}/`)) return true;
		for (const loc of LOCALES) {
			const localPath = `/${loc}${root}`;
			if (pathname === localPath || pathname.startsWith(`${localPath}/`)) return true;
		}
	}
	return false;
}

function buildLoginRedirect(request: NextRequest): NextResponse {
	const url = request.nextUrl.clone();
	url.pathname = "/login";
	url.searchParams.set("next", "/my-learning");
	return NextResponse.redirect(url);
}

function shouldSkipMiddlewarePath(pathname: string): boolean {
	return (
		pathname === "/api" ||
		pathname.startsWith("/api/") ||
		pathname === "/_next" ||
		pathname.startsWith("/_next/") ||
		pathname === "/_vercel" ||
		pathname.startsWith("/_vercel/") ||
		pathname === "/auth" ||
		pathname.startsWith("/auth/") ||
		pathname.includes(".")
	);
}

/**
 * Auth callbacks must run on the host Supabase / email links actually hit.
 * Legacy 308 before the handler would either drop the code exchange or set
 * session cookies on tradelovin.com while the browser continues on the
 * canonical host as a guest.
 */
function shouldBypassLegacyOverseasRedirect(pathname: string): boolean {
	return (
		pathname === "/auth/callback" ||
		pathname.startsWith("/auth/callback/") ||
		pathname === "/auth/handoff" ||
		pathname.startsWith("/auth/handoff/") ||
		pathname === "/auth/magic-link" ||
		pathname.startsWith("/auth/magic-link/") ||
		pathname === "/api/auth/magic-link" ||
		pathname.startsWith("/api/auth/magic-link/")
	);
}

async function enforceAuth(request: NextRequest): Promise<NextResponse | null> {
	if (!isProtectedPath(request.nextUrl.pathname)) return null;
	console.log("[middleware enforceAuth] check", { pathname: request.nextUrl.pathname });

	const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
	const anon = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
	if (!url || !anon) return null;

	const supabase = createServerClient(url, anon, {
		cookies: {
			getAll() {
				return request.cookies.getAll();
			},
			setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
				void cookiesToSet;
			},
		},
	});

	const {
		data: { user },
		error,
	} = await supabase.auth.getUser();
	if (error || !user) {
		console.warn("[middleware enforceAuth] redirect to login", {
			pathname: request.nextUrl.pathname,
			hasError: Boolean(error),
		});
		return buildLoginRedirect(request);
	}
	console.log("[middleware enforceAuth] pass", { pathname: request.nextUrl.pathname, userId: user.id });
	return null;
}

export default function middleware(request: NextRequest) {
	return middlewareAsync(request);
}

async function middlewareAsync(request: NextRequest) {
	const { pathname } = request.nextUrl;
	// 内地 Nginx 会将 Host 改写为 Worker；魔法链接改用 X-Forwarded-Host 保留原始入口。
	const host = request.headers.get("host") ?? "";
	const hostname = host.split(":")[0] ?? "";
	const legacyOverseasRedirectEnabled =
		process.env.ENABLE_LEGACY_OVERSEAS_REDIRECT === "1" ||
		process.env.ENABLE_LEGACY_OVERSEAS_REDIRECT === "true";
	const legacyOverseas = legacyOverseasRedirectEnabled
		? buildLegacyOverseasRedirectUrl({
				hostname,
				href: request.nextUrl.href,
			})
		: null;

	if (shouldSkipMiddlewarePath(pathname)) {
		if (legacyOverseas && !shouldBypassLegacyOverseasRedirect(pathname)) {
			return NextResponse.redirect(legacyOverseas, 308);
		}
		return NextResponse.next();
	}

	if (process.env.NODE_ENV === "production") {
		const forwardedProto = request.headers.get("x-forwarded-proto");
		const protocol = request.nextUrl.protocol;
		const shouldForceHttps = isHttpsOnlyHost(hostname);
		const isHttpByHeader = forwardedProto ? forwardedProto !== "https" : false;
		const isHttpByUrl = protocol !== "https:";
		if (shouldForceHttps && host && (isHttpByHeader || isHttpByUrl)) {
			const url = request.nextUrl.clone();
			url.protocol = "https:";
			url.host = host;
			return NextResponse.redirect(url, 308);
		}
	}

	if (legacyOverseas && !shouldBypassLegacyOverseasRedirect(pathname)) {
		return NextResponse.redirect(legacyOverseas, 308);
	}

	/* /admin 总入口隐藏；仅开放视频统计专用登录与看板（analytics 角色） */
	if (pathname === "/admin") {
		const url = request.nextUrl.clone();
		url.pathname = "/admin/login";
		return NextResponse.redirect(url, 308);
	}

	if (
		pathname.startsWith("/admin/") &&
		!pathname.startsWith("/admin/analytics") &&
		!pathname.startsWith("/admin/login")
	) {
		return new NextResponse(null, { status: 404 });
	}

	if (/^\/(zh|zh-TW|en)\/admin(\/|$)/.test(pathname)) {
		return new NextResponse(null, { status: 404 });
	}

	if (
		pathname === "/admin/analytics" ||
		pathname.startsWith("/admin/analytics/") ||
		pathname === "/admin/login" ||
		pathname.startsWith("/admin/login/")
	) {
		return withInvokePath(request);
	}

	if (pathname === "/cjkzt" || pathname.startsWith("/cjkzt/")) {
		return withInvokePath(request);
	}

	const legacyLearning = redirectLegacyLearningPaths(request);
	if (legacyLearning) {
		return legacyLearning;
	}

	const authedGuard = await enforceAuth(request);
	if (authedGuard) {
		return authedGuard;
	}

	/* guo3guan.com：默认入口为繁体（zh-TW）；tradelovin.com / 其余域名仍为 defaultLocale（zh）。
	 * localePrefix=as-needed 时简体无前缀 /trade，仅用「是否已为 /zh-TW 或 /en」判断。
	 */
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

	return intlMiddleware(requestWithInvokePath(request));
}

export const config = {
	matcher: ["/:path*"],
};
