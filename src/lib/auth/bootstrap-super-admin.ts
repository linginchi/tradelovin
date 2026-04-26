import type { SupabaseClient } from "@supabase/supabase-js";

/** 该邮箱首次验证码登录成功后，在 `admins` 表中强制为 `super_admin`（幂等） */
export const BOOTSTRAP_SUPER_ADMIN_EMAIL = "mark@hkfac.com";

export async function promoteBootstrapSuperAdmin(
	supabase: SupabaseClient,
	email: string,
): Promise<void> {
	const e = email.trim().toLowerCase();
	if (e !== BOOTSTRAP_SUPER_ADMIN_EMAIL.toLowerCase()) return;

	await supabase.from("admins").update({ role: "super_admin" }).eq("email", e);
}
