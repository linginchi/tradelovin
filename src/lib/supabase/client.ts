import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

/** 浏览器端 Supabase；未配置环境变量时返回 null。 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
	if (!url || !key) return null;
	if (!browserClient) {
		browserClient = createClient(url, key);
	}
	return browserClient;
}
