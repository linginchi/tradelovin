import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SESSION_COOKIE_MAX_AGE_SECONDS } from "@/lib/supabase/session";

let browserClient: SupabaseClient | null = null;

/** 浏览器端 Supabase；未配置环境变量时返回 null。 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
	const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
	if (!rawUrl || !key) return null;

	// 内地访问：通过 Nginx 代理连接 Supabase
	let url = rawUrl;
	if (typeof window !== "undefined") {
		const hostname = window.location.hostname;
		if (hostname === "xeoaxis.com" || hostname === "www.xeoaxis.com") {
			url = window.location.origin + "/supabase-proxy";
		}
	}

	if (!browserClient) {
		browserClient = createBrowserClient(url, key, {
			cookieOptions: {
				maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
			},
		});
	}
	return browserClient;
}
