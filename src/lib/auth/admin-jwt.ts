import * as jose from "jose";

export type AdminRole = "super_admin" | "admin" | "analytics";

export type AdminJwtPayload = {
	email: string;
	role: AdminRole;
};

const DEV_ADMIN_JWT_FALLBACK_SECRET = "dev-admin-jwt-fallback-secret";
let hasWarnedMissingAdminJwtSecret = false;

function getSecret(): Uint8Array {
	const s = process.env.ADMIN_JWT_SECRET?.trim();
	if (s) return new TextEncoder().encode(s);

	if (process.env.NODE_ENV !== "production") {
		if (!hasWarnedMissingAdminJwtSecret) {
			hasWarnedMissingAdminJwtSecret = true;
			console.warn(
				"[admin-jwt] ADMIN_JWT_SECRET is not set; using development fallback secret.",
			);
		}
		return new TextEncoder().encode(DEV_ADMIN_JWT_FALLBACK_SECRET);
	}

	throw new Error("ADMIN_JWT_SECRET is not set");
}

export async function signAdminToken(payload: AdminJwtPayload): Promise<string> {
	return new jose.SignJWT({ role: payload.role })
		.setProtectedHeader({ alg: "HS256" })
		.setSubject(payload.email)
		.setIssuedAt()
		.setExpirationTime("7d")
		.sign(getSecret());
}

export async function verifyAdminToken(token: string): Promise<AdminJwtPayload> {
	const { payload } = await jose.jwtVerify(token, getSecret());
	const email = typeof payload.sub === "string" ? payload.sub : "";
	const role = payload.role as AdminRole | undefined;
	if (!email || (role !== "admin" && role !== "super_admin" && role !== "analytics")) {
		throw new Error("Invalid admin token payload");
	}
	return { email, role };
}
