import { NextResponse } from "next/server";

import { GET as getTqScore } from "@/app/api/tq/score/route";

export const runtime = "nodejs";

const SUNSET_DATE = "Wed, 31 Dec 2026 00:00:00 GMT";

export async function GET(request: Request) {
	console.warn("[TQ] legacy endpoint hit: /api/fdt-score");
	const response = await getTqScore(request);
	const wrapped = NextResponse.json(await response.json(), { status: response.status });
	for (const [key, value] of response.headers.entries()) {
		if (key.toLowerCase() === "content-type") continue;
		wrapped.headers.set(key, value);
	}
	wrapped.headers.set("Deprecation", "true");
	wrapped.headers.set("Sunset", SUNSET_DATE);
	wrapped.headers.set("Link", '</api/tq/score>; rel="successor-version"');
	wrapped.headers.set("X-TQ-Legacy-Alias", "fdt-score");
	return wrapped;
}

