import { cookies } from "next/headers";

import { verifyAdminToken, type AdminJwtPayload } from "./admin-jwt";

export const ADMIN_TOKEN_COOKIE = "admin_token";

export async function getAdminSession(): Promise<AdminJwtPayload | null> {
	const jar = await cookies();
	const token = jar.get(ADMIN_TOKEN_COOKIE)?.value;
	if (!token) return null;
	try {
		return await verifyAdminToken(token);
	} catch {
		return null;
	}
}

export function isSuperAdmin(session: AdminJwtPayload | null): boolean {
	return session?.role === "super_admin";
}
