import { createHmac, timingSafeEqual } from "node:crypto";

export const STAFF_PAY_COOKIE = "staff_pay";
export const DEV_STAFF_PAY_PASSWORD = "staffpay";
export const STAFF_PAY_COOKIE_MAX_AGE = 60 * 60 * 12;
export const STAFF_PAY_CREATED_BY = "staff";

export function resolveStaffPayPassword(
	env: Record<string, string | undefined> = process.env,
	nodeEnv: string | undefined = process.env.NODE_ENV,
): string | null {
	const configured = env.STAFF_PAY_PASSWORD?.trim();
	if (configured) return configured;
	if (nodeEnv !== "production") return DEV_STAFF_PAY_PASSWORD;
	return null;
}

export function isStaffPayPassword(input: string, expected: string | null): boolean {
	if (!expected) return false;
	const a = Buffer.from(String(input ?? ""), "utf8");
	const b = Buffer.from(expected, "utf8");
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

export function signStaffPayCookie(password: string): string {
	return createHmac("sha256", password).update("staff-pay-ok").digest("base64url");
}

export function verifyStaffPayCookie(
	token: string | undefined,
	password: string | null,
): boolean {
	if (!token || !password) return false;
	return isStaffPayPassword(token, signStaffPayCookie(password));
}

export function staffPayCookieOptions(nodeEnv: string | undefined = process.env.NODE_ENV) {
	return {
		httpOnly: true,
		secure: nodeEnv === "production",
		sameSite: "lax" as const,
		path: "/",
		maxAge: STAFF_PAY_COOKIE_MAX_AGE,
	};
}
