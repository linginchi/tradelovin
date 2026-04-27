import { NextResponse } from "next/server";

/** Short public cache for semi-static JSON (CDN + browser). */
export const CACHE_CONTROL_PUBLIC_SHORT =
	"public, max-age=300, stale-while-revalidate=60";

export function jsonWithCache<T>(data: T, init?: ResponseInit) {
	const headers = new Headers(init?.headers);
	headers.set("Cache-Control", CACHE_CONTROL_PUBLIC_SHORT);
	return NextResponse.json(data, { ...init, headers });
}
