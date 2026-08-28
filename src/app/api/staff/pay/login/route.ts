import { NextResponse } from "next/server";

import {
	isStaffPayPassword,
	resolveStaffPayPassword,
	signStaffPayCookie,
	staffPayCookieOptions,
	STAFF_PAY_COOKIE,
} from "@/lib/staff-pay/gate";
import { requireStaffPayCsrf } from "@/lib/staff-pay/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
	const csrf = requireStaffPayCsrf(request);
	if (csrf) return csrf;

	const expected = resolveStaffPayPassword();
	if (!expected) {
		return NextResponse.json({ success: false, error: "职员收款未配置密码" }, { status: 503 });
	}

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
	}

	const password =
		raw && typeof raw === "object" && "password" in raw
			? String((raw as { password?: unknown }).password ?? "")
			: "";

	if (!isStaffPayPassword(password, expected)) {
		return NextResponse.json({ success: false, error: "密码错误" }, { status: 401 });
	}

	const response = NextResponse.json({ success: true });
	response.cookies.set(STAFF_PAY_COOKIE, signStaffPayCookie(expected), staffPayCookieOptions());
	return response;
}
