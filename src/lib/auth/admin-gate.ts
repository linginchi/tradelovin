import { BOOTSTRAP_SUPER_ADMIN_EMAIL } from "@/lib/auth/bootstrap-super-admin";

/** 仅该邮箱可通过管理后台入口（验证码）登录。 */
export const ADMIN_PORTAL_EMAIL = BOOTSTRAP_SUPER_ADMIN_EMAIL;

export function isAdminPortalEmail(email: string): boolean {
	return email.trim().toLowerCase() === ADMIN_PORTAL_EMAIL.toLowerCase();
}
