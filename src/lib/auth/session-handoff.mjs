import * as jose from "jose";

import {
	CANONICAL_OVERSEAS_HOSTNAME,
	isLegacyOverseasHost,
	isMainlandEntryHost,
	normalizeHostname,
} from "../site-entries.mjs";

const HANDOFF_TYP = "session_handoff";
const HANDOFF_TTL_SECONDS = 90;

export function sanitizeNextPath(raw) {
	if (raw && String(raw).startsWith("/") && !String(raw).startsWith("//")) return String(raw);
	return "/my-learning";
}

/**
 * Legacy overseas hosts 308 HTML pages to the canonical domain, so auth cookies
 * set on tradelovin.com never reach leolearnstotrade.com. After a successful
 * login on a legacy host we mint a short-lived handoff ticket and finish the
 * session on the canonical host instead.
 */
export function needsOverseasSessionHandoff(hostname) {
	const host = normalizeHostname(hostname);
	if (!host) return false;
	if (isMainlandEntryHost(host)) return false;
	return isLegacyOverseasHost(host);
}

export function buildCanonicalHandoffUrl(ticket, nextPath) {
	const url = new URL(`https://${CANONICAL_OVERSEAS_HOSTNAME}/auth/handoff`);
	url.searchParams.set("ticket", ticket);
	url.searchParams.set("next", sanitizeNextPath(nextPath));
	return url.toString();
}

function getHandoffSecret() {
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

export async function signSessionHandoff(payload) {
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

export async function verifySessionHandoff(ticket) {
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
