import { NextResponse } from "next/server";

import type { AdminJwtPayload } from "@/lib/auth/admin-jwt";
import { getAdminSession, isSuperAdmin } from "@/lib/auth/admin-session";

export type AdminGuardOk = { session: AdminJwtPayload };

/** 401 未登录；403 非管理员角色（JWT 内应为 admin | super_admin） */
export async function requireAdminSession(): Promise<AdminGuardOk | NextResponse> {
	const session = await getAdminSession();
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	if (session.role !== "admin" && session.role !== "super_admin") {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	return { session };
}

export async function requireSuperAdminSession(): Promise<AdminGuardOk | NextResponse> {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;
	if (!isSuperAdmin(gated.session)) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	return gated;
}
