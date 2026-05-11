import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/** 与 NEXT_PUBLIC_SUPABASE_URL 一致；环境变量缺失时使用项目默认实例（构建/本地兜底）。 */
const SUPABASE_URL =
	(typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
		process.env.NEXT_PUBLIC_SUPABASE_URL.trim()) ||
	"https://bpuqqyqmrtchaqfouygm.supabase.co";

function supabaseOrigin(): URL {
	try {
		return new URL(SUPABASE_URL);
	} catch {
		return new URL("https://bpuqqyqmrtchaqfouygm.supabase.co");
	}
}

type RouteCtx = { params: Promise<{ path?: string[] }> };

async function proxy(request: NextRequest, pathSegments: string[]) {
	const path = pathSegments.join("/");
	const origin = supabaseOrigin();
	const searchParams = request.nextUrl.searchParams.toString();
	const targetUrl = `${origin.origin}/${path}${searchParams ? `?${searchParams}` : ""}`;

	const headers = new Headers(request.headers);
	headers.set("host", origin.host);
	headers.delete("cookie");

	const init: RequestInit & { duplex?: "half" } = {
		method: request.method,
		headers,
	};

	if (request.method !== "GET" && request.method !== "HEAD") {
		init.body = request.body;
		init.duplex = "half";
	}

	const response = await fetch(targetUrl, init);

	const responseHeaders = new Headers(response.headers);
	responseHeaders.delete("set-cookie");

	return new NextResponse(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: responseHeaders,
	});
}

async function handle(request: NextRequest, ctx: RouteCtx) {
	const { path } = await ctx.params;
	return proxy(request, path ?? []);
}

export async function GET(request: NextRequest, ctx: RouteCtx) {
	return handle(request, ctx);
}

export async function HEAD(request: NextRequest, ctx: RouteCtx) {
	return handle(request, ctx);
}

export async function POST(request: NextRequest, ctx: RouteCtx) {
	return handle(request, ctx);
}

export async function PUT(request: NextRequest, ctx: RouteCtx) {
	return handle(request, ctx);
}

export async function PATCH(request: NextRequest, ctx: RouteCtx) {
	return handle(request, ctx);
}

export async function DELETE(request: NextRequest, ctx: RouteCtx) {
	return handle(request, ctx);
}
