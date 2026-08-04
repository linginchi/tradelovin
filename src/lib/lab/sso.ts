import * as jose from "jose";
import { timingSafeEqual } from "node:crypto";

import { getServiceSupabase } from "@/lib/supabase/service";

const AUTH_CODE_TTL_SEC = 60;
const SESSION_TTL_SEC = 60 * 60;
const DEV_SSO_FALLBACK = "dev-lab-sso-fallback-secret";

export type LabSessionClaims = {
	userId: string;
	planHint?: string;
};

function getSsoSecret(): Uint8Array {
	const s = process.env.LAB_SSO_SECRET?.trim();
	if (s) return new TextEncoder().encode(s);
	if (process.env.NODE_ENV !== "production") {
		return new TextEncoder().encode(DEV_SSO_FALLBACK);
	}
	throw new Error("LAB_SSO_SECRET is not set");
}

export function getLabPublicBaseUrl(): string | null {
	const raw =
		process.env.LAB_PUBLIC_BASE_URL?.trim() || process.env.NEXT_PUBLIC_LAB_BASE_URL?.trim();
	if (!raw) return null;
	return raw.replace(/\/$/, "");
}

export function assertDojoServerKey(headerValue: string | null): boolean {
	const expected = process.env.LAB_DOJO_SERVER_KEY?.trim();
	if (!expected) return false;
	if (!headerValue) return false;
	const token = headerValue.startsWith("Bearer ") ? headerValue.slice(7).trim() : headerValue.trim();
	if (!token) return false;
	const expectedBytes = new TextEncoder().encode(expected);
	const tokenBytes = new TextEncoder().encode(token);
	return tokenBytes.length === expectedBytes.length && timingSafeEqual(tokenBytes, expectedBytes);
}

/** 签发一次性授权码（JWT + DB jti，60s，单次消费） */
export async function issueLabAuthCode(userId: string): Promise<{
	code: string;
	expiresIn: number;
	labBaseUrl: string | null;
}> {
	const srv = getServiceSupabase();
	if (!srv) throw new Error("服务不可用");
	// Fail before creating a DB record when production secrets are incomplete.
	const secret = getSsoSecret();

	const jti = crypto.randomUUID();
	const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_SEC * 1000);

	const { error: insertErr } = await srv.from("lab_sso_codes").insert({
		jti,
		user_id: userId,
		expires_at: expiresAt.toISOString(),
	});
	if (insertErr) throw new Error(`写入授权码失败: ${insertErr.message}`);

	const code = await new jose.SignJWT({ purpose: "lab_auth_code" })
		.setProtectedHeader({ alg: "HS256" })
		.setSubject(userId)
		.setJti(jti)
		.setIssuedAt()
		.setExpirationTime(`${AUTH_CODE_TTL_SEC}s`)
		.sign(secret);

	return { code, expiresIn: AUTH_CODE_TTL_SEC, labBaseUrl: getLabPublicBaseUrl() };
}

/** Dojo 服务端兑换：校验 JWT + 单次消费 jti，返回短 session JWT */
export async function exchangeLabAuthCode(code: string): Promise<{
	sessionToken: string;
	expiresIn: number;
	userId: string;
}> {
	const srv = getServiceSupabase();
	if (!srv) throw new Error("服务不可用");

	let payload: jose.JWTPayload;
	try {
		({ payload } = await jose.jwtVerify(code, getSsoSecret()));
	} catch {
		throw new Error("授权码无效或已过期");
	}

	const userId = typeof payload.sub === "string" ? payload.sub : "";
	const jti = typeof payload.jti === "string" ? payload.jti : "";
	if (!userId || !jti || payload.purpose !== "lab_auth_code") {
		throw new Error("授权码载荷无效");
	}

	const { data: row, error: readErr } = await srv
		.from("lab_sso_codes")
		.select("jti,user_id,expires_at,consumed_at")
		.eq("jti", jti)
		.maybeSingle();
	if (readErr) throw new Error(`读取授权码失败: ${readErr.message}`);
	if (!row) throw new Error("授权码不存在或已使用");
	if (row.consumed_at) throw new Error("授权码已使用");
	if (row.user_id !== userId) throw new Error("授权码用户不匹配");
	if (new Date(String(row.expires_at)).getTime() < Date.now()) {
		throw new Error("授权码已过期");
	}

	const { data: consumed, error: consumeErr } = await srv
		.from("lab_sso_codes")
		.update({ consumed_at: new Date().toISOString() })
		.eq("jti", jti)
		.is("consumed_at", null)
		.select("jti")
		.maybeSingle();
	if (consumeErr) throw new Error(`消费授权码失败: ${consumeErr.message}`);
	if (!consumed) throw new Error("授权码已使用");

	const sessionToken = await new jose.SignJWT({ purpose: "lab_session" })
		.setProtectedHeader({ alg: "HS256" })
		.setSubject(userId)
		.setIssuedAt()
		.setExpirationTime(`${SESSION_TTL_SEC}s`)
		.sign(getSsoSecret());

	return { sessionToken, expiresIn: SESSION_TTL_SEC, userId };
}

export async function verifyLabSessionToken(token: string): Promise<LabSessionClaims> {
	const { payload } = await jose.jwtVerify(token, getSsoSecret());
	const userId = typeof payload.sub === "string" ? payload.sub : "";
	if (!userId || payload.purpose !== "lab_session") {
		throw new Error("会话无效");
	}
	return { userId };
}
