import { createHmac, randomInt, timingSafeEqual } from "crypto";

function getPepper(): string {
	const p = process.env.ADMIN_OTP_PEPPER || process.env.ADMIN_JWT_SECRET;
	if (!p) throw new Error("ADMIN_OTP_PEPPER or ADMIN_JWT_SECRET is not set");
	return p;
}

export function generateOtpCode(): string {
	return String(randomInt(100_000, 1_000_000));
}

export function hashOtp(email: string, code: string): string {
	const normalized = email.trim().toLowerCase();
	return createHmac("sha256", getPepper())
		.update(`${normalized}:${code}`)
		.digest("hex");
}

export function verifyOtp(email: string, code: string, codeHash: string): boolean {
	const a = Buffer.from(hashOtp(email, code), "hex");
	const b = Buffer.from(codeHash, "hex");
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}
