import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireSameOriginForMutation } from "@/lib/security/csrf";
import {
	resolveStaffPayPassword,
	STAFF_PAY_COOKIE,
	verifyStaffPayCookie,
} from "@/lib/staff-pay/gate";
import { isAllowedStaffPayBrowserOrigin } from "@/lib/staff-pay/staff-pay";

export function requireStaffPayCsrf(request: Request): NextResponse | null {
	const strict = requireSameOriginForMutation(request);
	if (!strict) return null;
	if (!isAllowedStaffPayBrowserOrigin(request)) return strict;
	const proto = request.headers.get("x-forwarded-proto");
	if (process.env.NODE_ENV === "production" && proto && proto !== "https") {
		return NextResponse.json({ success: false, error: "仅允许 HTTPS 请求" }, { status: 403 });
	}
	return null;
}

export async function hasValidStaffPayCookie(): Promise<boolean> {
	const jar = await cookies();
	return verifyStaffPayCookie(jar.get(STAFF_PAY_COOKIE)?.value, resolveStaffPayPassword());
}

export async function requireStaffPaySession(): Promise<true | NextResponse> {
	if (await hasValidStaffPayCookie()) return true;
	return NextResponse.json({ success: false, error: "请先输入职员密码" }, { status: 401 });
}
