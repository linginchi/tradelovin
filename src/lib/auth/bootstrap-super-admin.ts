import type { SupabaseClient } from "@supabase/supabase-js";

import { BOOTSTRAP_SUPER_ADMIN_EMAIL } from "@/lib/auth/admin-portal-constants";

export { BOOTSTRAP_SUPER_ADMIN_EMAIL };

export function isBootstrapSuperAdminEmail(email: string): boolean {
	return email.trim().toLowerCase() === BOOTSTRAP_SUPER_ADMIN_EMAIL.toLowerCase();
}

/**
 * 固定 OTP：
 * - 开发/测试环境默认开启（可用 ALLOW_FIXED_ADMIN_OTP=0/false 显式关闭）
 * - 生产环境默认关闭，且需双开关二次确认
 */
export function isFixedBootstrapOtpEnabled(): boolean {
	const raw = String(process.env.ALLOW_FIXED_ADMIN_OTP ?? "").trim().toLowerCase();
	const explicitlyEnabled = raw === "1" || raw === "true";
	const explicitlyDisabled = raw === "0" || raw === "false";
	const nonProdDefaultEnabled = process.env.NODE_ENV !== "production" && !explicitlyDisabled;
	const enabled = explicitlyEnabled || nonProdDefaultEnabled;

	if (!enabled) return false;
	if (process.env.NODE_ENV !== "production") return true;
	return (
		process.env.ALLOW_FIXED_ADMIN_OTP_IN_PRODUCTION === "1" ||
		process.env.ALLOW_FIXED_ADMIN_OTP_IN_PRODUCTION === "true"
	);
}

/** PostgREST / 枚举可能以不同形态返回，统一成小写字符串比较 */
export function isSuperAdminRole(role: unknown): boolean {
	return String(role ?? "").toLowerCase() === "super_admin";
}

/**
 * 幂等写入引导超级管理员行（生产未跑 migration 时固定码登录可自愈）。
 */
export async function ensureBootstrapSuperAdminRow(
	supabase: SupabaseClient,
): Promise<{ error: { message: string } | null }> {
	const email = BOOTSTRAP_SUPER_ADMIN_EMAIL.toLowerCase();
	const { error } = await supabase.from("admins").upsert(
		{ email, role: "super_admin" as const, created_by: null },
		{ onConflict: "email" },
	);
	return { error: error ? { message: error.message } : null };
}

export async function promoteBootstrapSuperAdmin(
	supabase: SupabaseClient,
	email: string,
): Promise<void> {
	const e = email.trim().toLowerCase();
	if (e !== BOOTSTRAP_SUPER_ADMIN_EMAIL.toLowerCase()) return;

	await supabase.from("admins").update({ role: "super_admin" }).eq("email", e);
}
