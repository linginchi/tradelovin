import * as jose from "jose";

export type AdminRole = "super_admin" | "admin";

export type AdminJwtPayload = {
	email: string;
	role: AdminRole;
};

function getSecret(): Uint8Array {
	const s = process.env.ADMIN_JWT_SECRET;
	if (!s) throw new Error("ADMIN_JWT_SECRET is not set");
	return new TextEncoder().encode(s);
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
	if (!email || (role !== "admin" && role !== "super_admin")) {
		throw new Error("Invalid admin token payload");
	}
	return { email, role };
}
