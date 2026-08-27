import {
	browserSupportsWebAuthn,
	startAuthentication,
	startRegistration,
	type PublicKeyCredentialCreationOptionsJSON,
	type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

import type { PasskeyRpId } from "@/lib/auth/passkey";

type PasskeyApiJson = {
	success?: boolean;
	challengeId?: string;
	options?: unknown;
	redirectTo?: string;
	enrolled?: boolean;
	rpId?: string;
	code?: string;
	error?: string;
};

function throwPasskeyApiError(json: PasskeyApiJson): never {
	if (typeof json.code === "string" && json.code) {
		throw new Error(json.code);
	}
	if (typeof json.error === "string" && json.error) {
		throw new Error(json.error);
	}
	throw new Error("passkey_failed");
}

export function webAuthnSupported(): boolean {
	if (typeof window === "undefined") return false;
	try {
		if (typeof browserSupportsWebAuthn === "function") return browserSupportsWebAuthn();
	} catch {
		// fall through to PublicKeyCredential
	}
	return typeof window.PublicKeyCredential === "function";
}

export function isPasskeyCancelled(error: unknown): boolean {
	const names: string[] = [];
	const codes: string[] = [];
	let current: unknown = error;
	for (let i = 0; i < 3 && current && typeof current === "object"; i += 1) {
		const rec = current as { name?: unknown; code?: unknown; cause?: unknown };
		if (typeof rec.name === "string") names.push(rec.name);
		if (typeof rec.code === "string") codes.push(rec.code);
		current = rec.cause;
	}
	return (
		names.includes("AbortError") ||
		names.includes("NotAllowedError") ||
		codes.includes("ERROR_CEREMONY_ABORTED")
	);
}

export function parsePasskeyRpId(value: unknown): PasskeyRpId | null {
	if (value === "leolearnstotrade.com" || value === "xeoaxis.com" || value === "localhost") {
		return value;
	}
	return null;
}

async function readJson(res: Response): Promise<PasskeyApiJson> {
	try {
		return (await res.json()) as PasskeyApiJson;
	} catch {
		return {};
	}
}

export async function fetchPasskeyStatus(): Promise<{ enrolled: boolean; rpId: PasskeyRpId } | null> {
	const res = await fetch("/api/auth/passkey/status", {
		credentials: "include",
		cache: "no-store",
	});
	const json = await readJson(res);
	const rpId = parsePasskeyRpId(json.rpId);
	if (!res.ok || !json.success || !rpId) return null;
	return { enrolled: json.enrolled === true, rpId };
}

export async function loginWithPasskey(next: string): Promise<string> {
	const optRes = await fetch("/api/auth/passkey/login/options", {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({}),
	});
	const optJson = await readJson(optRes);
	if (!optRes.ok || !optJson.success || typeof optJson.challengeId !== "string" || !optJson.options) {
		throwPasskeyApiError(optJson);
	}
	const credential = await startAuthentication({
		optionsJSON: optJson.options as PublicKeyCredentialRequestOptionsJSON,
	});
	const verRes = await fetch("/api/auth/passkey/login/verify", {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			challengeId: optJson.challengeId,
			credential,
			next,
		}),
	});
	const verJson = await readJson(verRes);
	if (!verRes.ok || !verJson.success || typeof verJson.redirectTo !== "string") {
		throwPasskeyApiError(verJson);
	}
	return verJson.redirectTo;
}

export async function registerPasskey(replace = false): Promise<void> {
	const optRes = await fetch("/api/auth/passkey/register/options", {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(replace ? { replace: true } : {}),
	});
	const optJson = await readJson(optRes);
	if (!optRes.ok || !optJson.success || typeof optJson.challengeId !== "string" || !optJson.options) {
		throwPasskeyApiError(optJson);
	}
	const credential = await startRegistration({
		optionsJSON: optJson.options as PublicKeyCredentialCreationOptionsJSON,
	});
	const verRes = await fetch("/api/auth/passkey/register/verify", {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			challengeId: optJson.challengeId,
			credential,
		}),
	});
	const verJson = await readJson(verRes);
	if (!verRes.ok || !verJson.success) {
		throwPasskeyApiError(verJson);
	}
}
