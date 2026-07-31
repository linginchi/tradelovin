import {
	createChunks,
	DEFAULT_COOKIE_OPTIONS,
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

export type WritableAuthSession = Pick<
	Session,
	"access_token" | "refresh_token" | "expires_at" | "expires_in" | "token_type" | "user"
>;

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
	const payload = JSON.stringify({
		access_token: session.access_token,
		refresh_token: session.refresh_token,
		expires_at: session.expires_at,
		expires_in: session.expires_in,
		token_type: session.token_type ?? "bearer",
		user: session.user,
	});
	const encoded = `base64-${stringToBase64URL(payload)}`;
	const chunks = createChunks(storageKey, encoded);
	const options = withPersistentSessionCookieOptions({ ...DEFAULT_COOKIE_OPTIONS });

	for (const { name, value } of chunks) {
		response.cookies.set(name, value, options);
	}
}
