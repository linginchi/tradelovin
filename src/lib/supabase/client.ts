import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

/** 瀏覽器端 Supabase；未配置環境變量時返回 null。 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
	const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
	if (!rawUrl || !key) return null;

	// 內地訪問：通過 Nginx 代理連接 Supabase
	let url = rawUrl;
	if (typeof window !== "undefined") {
		const hostname = window.location.hostname;
		if (hostname === "xeoaxis.com" || hostname === "www.xeoaxis.com") {
			url = window.location.origin + "/supabase-proxy";
		}
	}

	if (!browserClient) {
		browserClient = createClient(url, key);
	}
	return browserClient;
}
