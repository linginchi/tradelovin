import { randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { randomInternalPassword } from "@/lib/auth/auto-register";
import { isBootstrapSuperAdminEmail } from "@/lib/auth/bootstrap-super-admin";
import { signAdminToken } from "@/lib/auth/admin-jwt";
import { ADMIN_TOKEN_COOKIE } from "@/lib/auth/admin-session";
import { getTradeUserIdByEmail } from "@/lib/auth/profile-resolve";
import { getOrCreateSimAccount } from "@/lib/trade/sim-account";
import {
	writeSupabaseSessionCookies,
	type WritableAuthSession,
} from "@/lib/supabase/session";

const TOKEN_BYTES = 32;
export const MAGIC_LINK_EXPIRE_MINUTES = 30;
export const MAGIC_LINK_SEND_LIMIT_PER_HOUR = 5;

export function generateMagicLinkToken(): string {
	return randomBytes(TOKEN_BYTES).toString("hex");
}

function fallbackNicknameFromEmail(emailLower: string): string {
	const prefix = emailLower.split("@")[0]?.trim();
	if (!prefix) return "学员";
	return prefix.slice(0, 32);
}

export async function countRecentMagicLinkSends(srv: SupabaseClient, emailLower: string): Promise<number> {
	const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
	const { count, error } = await srv
		.from("email_login_tokens")
		.select("id", { count: "exact", head: true })
		.eq("email", emailLower)
		.gte("created_at", windowStart);
	if (error) {
		console.error("[magic-link countRecentMagicLinkSends]", error.message);
		return Number.MAX_SAFE_INTEGER;
	}
	return count ?? 0;
}

export async function issueMagicLinkToken(srv: SupabaseClient, emailLower: string, token: string): Promise<boolean> {
	const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRE_MINUTES * 60 * 1000).toISOString();
	const { error } = await srv.from("email_login_tokens").insert({
		email: emailLower,
		token,
		expires_at: expiresAt,
		used: false,
	});
	if (error) {
		console.error("[magic-link issueMagicLinkToken]", error.message);
		return false;
	}
	return true;
}

async function ensureTradeUserByEmail(srv: SupabaseClient, emailLower: string): Promise<string | null> {
	const existingUserId = await getTradeUserIdByEmail(srv, emailLower);
	if (existingUserId) return existingUserId;

	const password = randomInternalPassword();
	const nickname = fallbackNicknameFromEmail(emailLower);
	const { data, error } = await srv.auth.admin.createUser({
		email: emailLower,
		password,
		email_confirm: true,
		user_metadata: {
			nickname,
		},
	});
	if (error || !data.user) {
		console.error("[magic-link ensureTradeUserByEmail createUser]", error?.message ?? "empty user");
		return null;
	}

	const userId = data.user.id;
	const { error: profileErr } = await srv.from("profiles").upsert(
		{
			id: userId,
			nickname,
			role: "user",
		},
		{ onConflict: "id" },
	);
	if (profileErr) {
		console.error("[magic-link ensureTradeUserByEmail profile]", profileErr.message);
		await srv.auth.admin.deleteUser(userId);
		return null;
	}

	const sim = await getOrCreateSimAccount(srv, userId);
	if (sim.error) {
		console.error("[magic-link ensureTradeUserByEmail sim]", sim.error.message);
		await srv.from("profiles").delete().eq("id", userId);
		await srv.auth.admin.deleteUser(userId);
		return null;
	}
	return userId;
}

/**
 * Plain anon client (no cookie adapter). On Cloudflare Workers / OpenNext,
 * `@supabase/ssr` auth network calls on the cookie client have been unreliable —
 * mint tokens here, then write `sb-*` cookies directly onto the response.
 */
function createEphemeralAnonClient(): SupabaseClient {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
	if (!url || !anon) {
		throw new Error("Missing NEXT_PUBLIC Supabase env");
	}
	return createClient(url, anon, {
		auth: {
			persistSession: false,
			autoRefreshToken: false,
			detectSessionInUrl: false,
		},
	});
}

type MintedSession = {
	ok: true;
	accessToken: string;
	refreshToken: string;
	session: WritableAuthSession;
};

function toMintedSession(session: {
	access_token: string;
	refresh_token: string;
	expires_at?: number;
	expires_in?: number;
	token_type?: string;
	user: WritableAuthSession["user"];
}): MintedSession {
	return {
		ok: true,
		accessToken: session.access_token,
		refreshToken: session.refresh_token,
		session: {
			access_token: session.access_token,
			refresh_token: session.refresh_token,
			expires_at: session.expires_at,
			expires_in: session.expires_in,
			token_type: session.token_type ?? "bearer",
			user: session.user,
		},
	};
}

async function mintSessionTokens(
	srv: SupabaseClient,
	emailLower: string,
	userId: string,
): Promise<MintedSession | { ok: false }> {
	const { data: linkData, error: linkErr } = await srv.auth.admin.generateLink({
		type: "magiclink",
		email: emailLower,
	});
	const tokenHash = linkData?.properties?.hashed_token;
	if (!linkErr && tokenHash) {
		const anon = createEphemeralAnonClient();
		const { data, error: verifyErr } = await anon.auth.verifyOtp({
			type: "email",
			token_hash: tokenHash,
		});
		if (!verifyErr && data.session?.access_token && data.session.refresh_token && data.session.user) {
			return toMintedSession(data.session);
		}
		console.error("[magic-link verifyOtp]", verifyErr?.message ?? "empty session");
	} else {
		console.error("[magic-link generateLink]", linkErr?.message ?? "missing hashed_token");
	}

	// Fallback: rotate password + password grant on the same ephemeral client.
	const password = randomInternalPassword();
	const { error: updErr } = await srv.auth.admin.updateUserById(userId, { password });
	if (updErr) {
		console.error("[magic-link mintSessionTokens updateUserById]", updErr.message);
		return { ok: false };
	}
	const anon = createEphemeralAnonClient();
	const { data, error: signErr } = await anon.auth.signInWithPassword({
		email: emailLower,
		password,
	});
	if (signErr || !data.session?.access_token || !data.session.refresh_token || !data.session.user) {
		console.error("[magic-link mintSessionTokens signInWithPassword]", signErr?.message ?? "empty session");
		return { ok: false };
	}
	return toMintedSession(data.session);
}

export async function establishMagicLinkSession(
	srv: SupabaseClient,
	response: NextResponse,
	emailLower: string,
	userId: string,
): Promise<{ ok: true; accessToken: string; refreshToken: string } | { ok: false }> {
	const minted = await mintSessionTokens(srv, emailLower, userId);
	if (!minted.ok) return { ok: false };

	try {
		writeSupabaseSessionCookies(response, minted.session);
	} catch (error) {
		console.error(
			"[magic-link writeSessionCookies]",
			error instanceof Error ? error.message : error,
		);
		return { ok: false };
	}

	return {
		ok: true,
		accessToken: minted.accessToken,
		refreshToken: minted.refreshToken,
	};
}

async function ensureSuperAdminProfile(srv: SupabaseClient, userId: string, emailLower: string): Promise<boolean> {
	if (!isBootstrapSuperAdminEmail(emailLower)) return true;

	const { error: profileErr } = await srv
		.from("profiles")
		.upsert({ id: userId, role: "super_admin" }, { onConflict: "id" });
	if (profileErr) {
		console.error("[magic-link ensureSuperAdminProfile profile]", profileErr.message);
		return false;
	}

	const { error: adminErr } = await srv
		.from("admins")
		.upsert({ email: emailLower, role: "super_admin", created_by: null }, { onConflict: "email" });
	if (adminErr) {
		console.error("[magic-link ensureSuperAdminProfile admins]", adminErr.message);
		return false;
	}
	return true;
}

function attachAdminCookie(response: NextResponse, emailLower: string): Promise<void> | void {
	if (!isBootstrapSuperAdminEmail(emailLower)) return;
	return signAdminToken({ email: emailLower, role: "super_admin" }).then((adminToken) => {
		response.cookies.set(ADMIN_TOKEN_COOKIE, adminToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
			path: "/",
			maxAge: 60 * 60 * 24 * 7,
		});
	});
}

export type ConsumeMagicLinkResult =
	| { ok: true; accessToken: string; refreshToken: string }
	| { ok: false };

export async function consumeMagicLink(
	srv: SupabaseClient,
	request: NextRequest,
	response: NextResponse,
	token: string,
): Promise<ConsumeMagicLinkResult> {
	const { data: row, error: queryErr } = await srv
		.from("email_login_tokens")
		.select("id, email, expires_at, used")
		.eq("token", token)
		.maybeSingle();
	if (queryErr || !row) {
		console.warn("[magic-link consume] token not found");
		return { ok: false };
	}

	const expiresAtMs = new Date(String(row.expires_at)).getTime();
	if (row.used || Number.isNaN(expiresAtMs) || expiresAtMs < Date.now()) {
		console.warn("[magic-link consume] token invalid state");
		return { ok: false };
	}

	const emailLower = String(row.email).trim().toLowerCase();
	if (!emailLower) {
		console.warn("[magic-link consume] email missing");
		return { ok: false };
	}

	const userId = await ensureTradeUserByEmail(srv, emailLower);
	if (!userId) return { ok: false };

	const adminProfileOk = await ensureSuperAdminProfile(srv, userId, emailLower);
	if (!adminProfileOk) return { ok: false };

	const signedIn = await establishMagicLinkSession(srv, response, emailLower, userId);
	if (!signedIn.ok) return { ok: false };

	// Only burn the token after the session is established, so a transient
	// sign-in failure does not strand the user with "invalid or expired".
	const { data: consumed, error: consumeErr } = await srv
		.from("email_login_tokens")
		.update({ used: true })
		.eq("id", row.id as string)
		.eq("used", false)
		.select("id")
		.maybeSingle();
	if (consumeErr || !consumed) {
		console.warn("[magic-link consume] token already consumed");
		return { ok: false };
	}

	await attachAdminCookie(response, emailLower);

	return {
		ok: true,
		accessToken: signedIn.accessToken,
		refreshToken: signedIn.refreshToken,
	};
}
