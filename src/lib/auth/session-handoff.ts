import * as jose from "jose";

import {
	buildCanonicalHandoffUrl,
	needsOverseasSessionHandoff,
	sanitizeNextPath,
} from "@/lib/auth/session-handoff.mjs";

export type SessionHandoffPayload = {
	accessToken: string;
	refreshToken: string;
	nextPath: string;
};

export { buildCanonicalHandoffUrl, needsOverseasSessionHandoff, sanitizeNextPath };

const HANDOFF_TYP = "session_handoff";
const HANDOFF_TTL_SECONDS = 90;

function getHandoffSecret(): Uint8Array {
	const secret =
		process.env.ADMIN_JWT_SECRET?.trim() ||
		process.env.LAB_SSO_SECRET?.trim() ||
		process.env.VIDEO_PLAY_TOKEN_SECRET?.trim() ||
		"";
	if (!secret) {
		throw new Error("Missing handoff signing secret");
	}
	return new TextEncoder().encode(secret);
}

export async function signSessionHandoff(payload: SessionHandoffPayload): Promise<string> {
	return new jose.SignJWT({
		typ: HANDOFF_TYP,
		access_token: payload.accessToken,
		refresh_token: payload.refreshToken,
		next: sanitizeNextPath(payload.nextPath),
	})
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime(`${HANDOFF_TTL_SECONDS}s`)
		.sign(getHandoffSecret());
}

export async function verifySessionHandoff(ticket: string): Promise<SessionHandoffPayload> {
	const { payload } = await jose.jwtVerify(ticket, getHandoffSecret());
	if (payload.typ !== HANDOFF_TYP) {
		throw new Error("Invalid handoff token type");
	}
	const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
	const refreshToken = typeof payload.refresh_token === "string" ? payload.refresh_token : "";
	const nextPath = sanitizeNextPath(typeof payload.next === "string" ? payload.next : null);
	if (!accessToken || !refreshToken) {
		throw new Error("Invalid handoff token payload");
	}
	return { accessToken, refreshToken, nextPath };
}
