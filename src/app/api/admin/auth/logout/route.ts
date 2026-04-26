import { NextResponse } from "next/server";

import { ADMIN_TOKEN_COOKIE } from "@/lib/auth/admin-session";

/** 允许未登录调用，用于清除已过期的 HttpOnly cookie */
export async function POST() {
	const res = NextResponse.json({ ok: true });
	res.cookies.set(ADMIN_TOKEN_COOKIE, "", {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		path: "/",
		maxAge: 0,
	});
	return res;
}
