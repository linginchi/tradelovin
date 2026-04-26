/** Edge-safe OTP（Web Crypto），与 Node createHmac('sha256') 结果一致，便于 Cloudflare/Edge 运行。 */

function getPepper(): string {
	const p = process.env.ADMIN_OTP_PEPPER || process.env.ADMIN_JWT_SECRET;
	if (!p) throw new Error("ADMIN_OTP_PEPPER or ADMIN_JWT_SECRET is not set");
	return p;
}

function toHex(buf: ArrayBuffer): string {
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateOtpCode(): string {
	const u = new Uint32Array(1);
	crypto.getRandomValues(u);
	return String(100_000 + (u[0] % 900_000));
}

export async function hashOtp(email: string, code: string): Promise<string> {
	const normalized = email.trim().toLowerCase();
	const pepper = getPepper();
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		enc.encode(pepper),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${normalized}:${code}`));
	return toHex(sig);
}

export async function verifyOtp(email: string, code: string, codeHash: string): Promise<boolean> {
	const expect = await hashOtp(email, code);
	if (expect.length !== codeHash.length) return false;
	let ok = 0;
	for (let i = 0; i < expect.length; i++) {
		ok |= expect.charCodeAt(i) ^ codeHash.charCodeAt(i);
	}
	return ok === 0;
}
