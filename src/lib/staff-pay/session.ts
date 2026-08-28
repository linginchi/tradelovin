import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
	resolveStaffPayPassword,
	STAFF_PAY_COOKIE,
	verifyStaffPayCookie,
} from "@/lib/staff-pay/gate";

export async function hasValidStaffPayCookie(): Promise<boolean> {
	const jar = await cookies();
	return verifyStaffPayCookie(jar.get(STAFF_PAY_COOKIE)?.value, resolveStaffPayPassword());
}

export async function requireStaffPaySession(): Promise<true | NextResponse> {
	if (await hasValidStaffPayCookie()) return true;
	return NextResponse.json({ success: false, error: "请先输入职员密码" }, { status: 401 });
}
