export type PasskeyRpId = "leolearnstotrade.com" | "xeoaxis.com" | "localhost";
export type PasskeyErrorCode =
	| "unsupported_rp"
	| "not_enrolled"
	| "challenge_expired"
	| "verify_failed"
	| "already_enrolled";

export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type PasskeyLoginKind = "cancelled" | "needs_enroll" | "missing_service_role" | "failed";

export function isLocalDevAuthHost(hostname: string): boolean {
	const h = String(hostname ?? "").trim().toLowerCase().split(":")[0] ?? "";
	return h === "localhost" || h === "127.0.0.1";
}

export function resolvePasskeyRpId(host: string): PasskeyRpId | null {
	const h = String(host ?? "").trim().toLowerCase().split(":")[0] ?? "";
	if (h === "localhost" || h === "127.0.0.1") return "localhost";
	if (h === "leolearnstotrade.com" || h === "www.leolearnstotrade.com") return "leolearnstotrade.com";
	if (h === "xeoaxis.com" || h === "www.xeoaxis.com") return "xeoaxis.com";
	return null;
}

export function classifyPasskeyLoginError(error: unknown): PasskeyLoginKind {
	const names: string[] = [];
	const codes: string[] = [];
	const messages: string[] = [];
	let current: unknown = error;
	for (let i = 0; i < 3 && current; i += 1) {
		if (typeof current === "string") {
			messages.push(current);
			break;
		}
		if (typeof current !== "object") break;
		const rec = current as { name?: unknown; code?: unknown; message?: unknown; cause?: unknown };
		if (typeof rec.name === "string") names.push(rec.name);
		if (typeof rec.code === "string") codes.push(rec.code);
		if (typeof rec.message === "string") messages.push(rec.message);
		current = rec.cause;
	}
	if (names.includes("AbortError") || codes.includes("ERROR_CEREMONY_ABORTED")) {
		return "cancelled";
	}
	if (
		codes.includes("service_unavailable") ||
		messages.includes("service_unavailable") ||
		messages.some((m) => m.includes("SUPABASE_SERVICE_ROLE_KEY"))
	) {
		return "missing_service_role";
	}
	if (codes.includes("not_enrolled") || messages.includes("not_enrolled") || names.includes("NotAllowedError")) {
		return "needs_enroll";
	}
	return "failed";
}

export function passkeyOriginAllowed(origin: string, rpId: PasskeyRpId): boolean {
	try {
		const u = new URL(origin);
		const hostRp = resolvePasskeyRpId(u.host);
		if (hostRp !== rpId) return false;
		if (rpId === "localhost") return u.protocol === "http:" || u.protocol === "https:";
		return u.protocol === "https:";
	} catch {
		return false;
	}
}

export function isChallengeOpen(
	row: { expires_at: string; consumed_at: string | null },
	nowMs: number,
): boolean {
	if (row.consumed_at) return false;
	const exp = Date.parse(row.expires_at);
	return Number.isFinite(exp) && exp >= nowMs;
}

export function isSignCountValid(stored: number, incoming: number): boolean {
	if (incoming === 0) return stored === 0;
	return incoming > stored;
}

export function enrollDismissStorageKey(userId: string, rpId: PasskeyRpId): string {
	return `passkey_enroll_dismissed:${userId}:${rpId}`;
}

/** Replace must never exclude the existing platform cred (InvalidStateError / same-device rebind). */
export function registrationExcludeCredentials(
	_existing: { credential_id: string } | null,
	_replace: boolean,
): [] {
	return [];
}
