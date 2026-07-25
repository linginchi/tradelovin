import type { SupabaseClient } from "@supabase/supabase-js";

import { BOOTSTRAP_SUPER_ADMIN_EMAIL, BOOTSTRAP_SUPER_ADMIN_EMAILS } from "@/lib/auth/admin-portal-constants";

export { BOOTSTRAP_SUPER_ADMIN_EMAIL, BOOTSTRAP_SUPER_ADMIN_EMAILS };

const BOOTSTRAP_SUPER_ADMIN_EMAIL_SET = new Set(
	BOOTSTRAP_SUPER_ADMIN_EMAILS.map((e) => e.toLowerCase()),
);

export function isBootstrapSuperAdminEmail(email: string): boolean {
	return BOOTSTRAP_SUPER_ADMIN_EMAIL_SET.has(email.trim().toLowerCase());
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
	if (!isBootstrapSuperAdminEmail(e)) return;

	await supabase.from("admins").update({ role: "super_admin" }).eq("email", e);
}
