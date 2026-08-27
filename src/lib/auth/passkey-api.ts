import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
	PASSKEY_CHALLENGE_TTL_MS,
	resolvePasskeyRpId,
	type PasskeyErrorCode,
	type PasskeyRpId,
} from "@/lib/auth/passkey";
import { getServiceSupabase } from "@/lib/supabase/service";

export const PASSKEY_RP_NAME = "新紮學豹";

const PASSKEY_ERROR_TEXT: Record<PasskeyErrorCode, string> = {
	unsupported_rp: "当前域名不支持 Passkey",
	not_enrolled: "尚未绑定 Passkey",
	challenge_expired: "验证已过期，请重试",
	verify_failed: "验证失败，请重试",
	already_enrolled: "已绑定 Passkey",
};

export type PasskeyChallengePurpose = "register" | "login";

export type PasskeyChallengeRow = {
	id: string;
	user_id: string | null;
	purpose: PasskeyChallengePurpose;
	rp_id: string;
	challenge: string;
	expires_at: string;
	consumed_at: string | null;
};

export type PasskeyCredentialRow = {
	id: string;
	user_id: string;
	rp_id: string;
	credential_id: string;
	public_key: unknown;
	sign_count: number | string;
	transports: string[] | null;
	device_label: string | null;
};

export function jsonPasskeyError(code: PasskeyErrorCode, status: number): NextResponse {
	return NextResponse.json({ success: false, error: PASSKEY_ERROR_TEXT[code], code }, { status });
}

export function serviceUnavailable(): NextResponse {
	return NextResponse.json(
		{ success: false, error: "服务端未配置 SUPABASE_SERVICE_ROLE_KEY", code: "service_unavailable" },
		{ status: 503 },
	);
}

export function requirePasskeyService(): SupabaseClient | NextResponse {
	const srv = getServiceSupabase();
	if (!srv) return serviceUnavailable();
	return srv;
}

export function resolveRequestRpId(request: Request): PasskeyRpId | NextResponse {
	const rpId = resolvePasskeyRpId(request.headers.get("host") ?? "");
	if (!rpId) return jsonPasskeyError("unsupported_rp", 400);
	return rpId;
}

export function requestOrigin(request: Request): string {
	return (request.headers.get("origin") ?? "").trim();
}

export async function readJsonBody(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		return {};
	}
}

export function asRecord(value: unknown): Record<string, unknown> {
	if (value && typeof value === "object" && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return {};
}

export function encodeBytea(bytes: Uint8Array): string {
	let hex = "";
	for (const b of bytes) hex += b.toString(16).padStart(2, "0");
	return `\\x${hex}`;
}

export function decodeBytea(value: unknown): Uint8Array<ArrayBuffer> | null {
	if (value instanceof Uint8Array) return new Uint8Array(value);
	if (typeof value !== "string" || !value) return null;
	if (value.startsWith("\\x") || value.startsWith("\\X")) {
		const hex = value.slice(2);
		if (hex.length % 2 !== 0) return null;
		const out = new Uint8Array(hex.length / 2);
		for (let i = 0; i < hex.length; i += 2) {
			const n = Number.parseInt(hex.slice(i, i + 2), 16);
			if (!Number.isFinite(n)) return null;
			out[i / 2] = n;
		}
		return out;
	}
	try {
		const bin = atob(value);
		const out = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
		return out;
	} catch {
		return null;
	}
}

export function deviceLabelFromRequest(request: Request): string | null {
	const ua = request.headers.get("user-agent")?.trim() ?? "";
	if (!ua) return null;
	return ua.slice(0, 80);
}

export function userIdBytes(userId: string): Uint8Array<ArrayBuffer> {
	const encoded = new TextEncoder().encode(userId);
	return new Uint8Array(encoded);
}

export async function insertPasskeyChallenge(
	srv: SupabaseClient,
	row: {
		userId: string | null;
		purpose: PasskeyChallengePurpose;
		rpId: PasskeyRpId;
		challenge: string;
	},
): Promise<string | null> {
	const expiresAt = new Date(Date.now() + PASSKEY_CHALLENGE_TTL_MS).toISOString();
	const { data, error } = await srv
		.from("passkey_challenges")
		.insert({
			user_id: row.userId,
			purpose: row.purpose,
			rp_id: row.rpId,
			challenge: row.challenge,
			expires_at: expiresAt,
		})
		.select("id")
		.maybeSingle();
	if (error || !data?.id) {
		console.error("[passkey insertChallenge]", error?.message ?? "empty id");
		return null;
	}
	return String(data.id);
}

export async function loadPasskeyChallenge(
	srv: SupabaseClient,
	challengeId: string,
): Promise<PasskeyChallengeRow | null> {
	const { data, error } = await srv
		.from("passkey_challenges")
		.select("id, user_id, purpose, rp_id, challenge, expires_at, consumed_at")
		.eq("id", challengeId)
		.maybeSingle();
	if (error || !data) return null;
	return data as PasskeyChallengeRow;
}

export async function consumePasskeyChallenge(srv: SupabaseClient, challengeId: string): Promise<boolean> {
	const { data, error } = await srv
		.from("passkey_challenges")
		.update({ consumed_at: new Date().toISOString() })
		.eq("id", challengeId)
		.is("consumed_at", null)
		.select("id")
		.maybeSingle();
	if (error) {
		console.error("[passkey consumeChallenge]", error.message);
		return false;
	}
	return Boolean(data?.id);
}

export async function casUpdatePasskeySignCount(
	srv: SupabaseClient,
	credentialRowId: string,
	storedCount: number,
	incomingCount: number,
): Promise<boolean> {
	const { data, error } = await srv
		.from("user_passkey_credentials")
		.update({
			sign_count: incomingCount,
			last_used_at: new Date().toISOString(),
		})
		.eq("id", credentialRowId)
		.eq("sign_count", storedCount)
		.select("id")
		.maybeSingle();
	if (error) {
		console.error("[passkey casUpdateSignCount]", error.message);
		return false;
	}
	return Boolean(data?.id);
}

export async function loadPasskeyCredentialById(
	srv: SupabaseClient,
	credentialId: string,
): Promise<PasskeyCredentialRow | null> {
	const { data, error } = await srv
		.from("user_passkey_credentials")
		.select("id, user_id, rp_id, credential_id, public_key, sign_count, transports, device_label")
		.eq("credential_id", credentialId)
		.maybeSingle();
	if (error || !data) return null;
	return data as PasskeyCredentialRow;
}

export async function loadPasskeyCredentialForUserRp(
	srv: SupabaseClient,
	userId: string,
	rpId: PasskeyRpId,
): Promise<{ id: string; credential_id: string; transports: string[] | null } | null> {
	const { data, error } = await srv
		.from("user_passkey_credentials")
		.select("id, credential_id, transports")
		.eq("user_id", userId)
		.eq("rp_id", rpId)
		.maybeSingle();
	if (error || !data) return null;
	return data as { id: string; credential_id: string; transports: string[] | null };
}

export async function emailByUserId(srv: SupabaseClient, userId: string): Promise<string | null> {
	const { data, error } = await srv.auth.admin.getUserById(userId);
	if (error || !data?.user?.email) return null;
	const email = String(data.user.email).trim().toLowerCase();
	return email || null;
}
