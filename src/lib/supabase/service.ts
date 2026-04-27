import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const serverClientOptions = {
	auth: {
		persistSession: false,
		autoRefreshToken: false,
	},
} as const;

/** 服务端专用；使用 service_role，可绕过 RLS。未配置时返回 null。 */
export function getServiceSupabase(): SupabaseClient | null {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) return null;
	return createClient(url, key, serverClientOptions);
}

/**
 * 优先 service_role；缺失时降级 anon（需表上有对应 RLS SELECT 策略，否则读仍可能失败）。
 * 用于公开读 API，避免 Worker 未配 SERVICE_ROLE_KEY 时整站 503。
 */
export function getServerSupabasePreferService(): SupabaseClient | null {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
	const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
	const key = serviceKey || anonKey;
	if (!url || !key) return null;
	return createClient(url, key, serverClientOptions);
}

/** 当前客户端是否使用 service_role（可写、绕过 RLS）。 */
export function hasServiceRoleKey(): boolean {
	return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
