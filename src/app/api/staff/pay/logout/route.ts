import { NextResponse } from "next/server";

import { requireSameOriginForMutation } from "@/lib/security/csrf";
import { staffPayCookieOptions, STAFF_PAY_COOKIE } from "@/lib/staff-pay/gate";

export const runtime = "nodejs";

export async function POST(request: Request) {
	const csrf = requireSameOriginForMutation(request);
	if (csrf) return csrf;

	const response = NextResponse.json({ success: true });
	response.cookies.set(STAFF_PAY_COOKIE, "", { ...staffPayCookieOptions(), maxAge: 0 });
	return response;
}
