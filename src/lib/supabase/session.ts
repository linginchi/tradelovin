import {
	combineChunks,
	createChunks,
	DEFAULT_COOKIE_OPTIONS,
	stringFromBase64URL,
	stringToBase64URL,
	type CookieOptions,
} from "@supabase/ssr";
import type { Session } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";

export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * 对 Supabase 会话 Cookie 统一应用长期有效期。
 * 保留显式删除语义（maxAge=0），避免影响退出登录。
 */
export function withPersistentSessionCookieOptions(options: CookieOptions): CookieOptions {
	if (options.maxAge === 0) return options;
	return {
		...options,
		maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
	};
}

/** Storage key used by `@supabase/ssr` / auth-js for the project. */
export function supabaseAuthStorageKey(supabaseUrl: string): string {
	const ref = new URL(supabaseUrl).hostname.split(".")[0];
	if (!ref) {
		throw new Error("Invalid NEXT_PUBLIC_SUPABASE_URL");
	}
	return `sb-${ref}-auth-token`;
}

export type WritableAuthSession = {
	access_token: string;
	refresh_token: string;
	user: Session["user"];
	expires_at?: number;
	expires_in?: number;
	token_type?: string;
};

/**
 * Persist a minted session onto the response without going through
 * `createServerClient().auth.setSession()`. On OpenNext Workers the SSR
 * client's network/`setSession` path has been observed not to emit `sb-*`
 * cookies even after a successful token mint.
 */
export function writeSupabaseSessionCookies(
	response: NextResponse,
	session: WritableAuthSession,
): void {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
	if (!url) {
		throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
	}

	const storageKey = supabaseAuthStorageKey(url);
	// Keep the cookie compact (tokens + minimal user). Full identity/metadata
	// blobs push past chunk limits and have been observed to fail SSR getUser
	// reconstitution on Workers even when Set-Cookie was present.
	const payload = JSON.stringify({
		access_token: session.access_token,
		refresh_token: session.refresh_token,
		expires_at: session.expires_at,
		expires_in: session.expires_in,
		token_type: session.token_type ?? "bearer",
		user: {
			id: session.user.id,
			aud: session.user.aud,
			role: session.user.role,
			email: session.user.email,
			email_confirmed_at: session.user.email_confirmed_at,
			phone: session.user.phone,
			confirmed_at: session.user.confirmed_at,
			last_sign_in_at: session.user.last_sign_in_at,
			app_metadata: session.user.app_metadata ?? {},
			user_metadata: {},
			identities: [],
			created_at: session.user.created_at,
			updated_at: session.user.updated_at,
			is_anonymous: session.user.is_anonymous ?? false,
		},
	});
	const encoded = `base64-${stringToBase64URL(payload)}`;
	const chunks = createChunks(storageKey, encoded);
	const options = withPersistentSessionCookieOptions({
		...DEFAULT_COOKIE_OPTIONS,
		secure: true,
	});

	for (const { name, value } of chunks) {
		response.cookies.set(name, value, options);
	}
}

type CookiePair = { name: string; value: string };

/**
 * Read the access_token out of chunked `sb-*-auth-token` cookies.
 * Used when `createServerClient().auth.getUser()` does not see the session
 * on OpenNext Workers even though the Cookie header is present.
 */
export async function readAccessTokenFromCookies(
	cookieList: CookiePair[],
	supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "",
): Promise<string | null> {
	if (!supabaseUrl || cookieList.length === 0) return null;
	const storageKey = supabaseAuthStorageKey(supabaseUrl);
	const byName = new Map(cookieList.map((c) => [c.name, c.value]));
	const combined = await combineChunks(storageKey, async (name) => byName.get(name) ?? null);
	if (!combined) return null;

	try {
		const raw = combined.startsWith("base64-")
			? stringFromBase64URL(combined.slice("base64-".length))
			: combined;
		const parsed = JSON.parse(raw) as { access_token?: unknown };
		return typeof parsed.access_token === "string" && parsed.access_token
			? parsed.access_token
			: null;
	} catch {
		return null;
	}
}
