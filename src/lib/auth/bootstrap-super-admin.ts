import type { SupabaseClient } from "@supabase/supabase-js";

import { BOOTSTRAP_SUPER_ADMIN_EMAIL } from "@/lib/auth/admin-portal-constants";

export { BOOTSTRAP_SUPER_ADMIN_EMAIL };

export function isBootstrapSuperAdminEmail(email: string): boolean {
	return email.trim().toLowerCase() === BOOTSTRAP_SUPER_ADMIN_EMAIL.toLowerCase();
}

/** PostgREST / 枚举可能以不同形态返回，统一成小写字符串比较 */
export function isSuperAdminRole(role: unknown): boolean {
	return String(role ?? "").toLowerCase() === "super_admin";
}

export async function promoteBootstrapSuperAdmin(
	supabase: SupabaseClient,
	email: string,
): Promise<void> {
	const e = email.trim().toLowerCase();
	if (e !== BOOTSTRAP_SUPER_ADMIN_EMAIL.toLowerCase()) return;

	await supabase.from("admins").update({ role: "super_admin" }).eq("email", e);
}
