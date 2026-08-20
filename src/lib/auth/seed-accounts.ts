/** 开发测试快捷登录账号（与 /api/auth/dev-test-login 一致）。 */
export const DEV_TEST_ACCOUNT_EMAIL = {
	kk: "kk@hkfac.com",
	william: "william@hkfac.com",
	mark: "mark@hkfac.com",
} as const;

export type DevTestAccountKey = keyof typeof DEV_TEST_ACCOUNT_EMAIL;

const DEV_TEST_EMAILS = new Set(
	Object.values(DEV_TEST_ACCOUNT_EMAIL).map((email) => email.toLowerCase()),
);

/** 测试快捷登录账号，或历史上用 seed SQL 灌过积分的超管白名单。 */
export function isSeedAccountEmail(email: string | null | undefined, superUserEmails: readonly string[]): boolean {
	if (!email) return false;
	const lower = email.trim().toLowerCase();
	if (DEV_TEST_EMAILS.has(lower)) return true;
	return superUserEmails.some((item) => item.toLowerCase() === lower);
}
