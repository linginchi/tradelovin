import type { CookieOptions } from "@supabase/ssr";

export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * 对 Supabase 会话 Cookie 统一应用长期有效期。
 * 保留显式删除语义（maxAge=0），避免影响退出登录。
 */
export function withPersistentSessionCookieOptions(options: CookieOptions): CookieOptions {
	if (options.maxAge === 0) return options;
	return {
		...options,
		maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
	};
}
