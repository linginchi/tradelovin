import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/** App Router 服务端：从 Cookie 读取 Supabase 会话，供 Route Handler / Server Component 使用。 */
export async function createServerSupabaseClient() {
	const cookieStore = await cookies();
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
	if (!url || !anon) {
		throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
	}
	return createServerClient(url, anon, {
		cookies: {
			getAll() {
				return cookieStore.getAll();
			},
			setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
				try {
					for (const { name, value, options } of cookiesToSet) {
						cookieStore.set(name, value, options);
					}
				} catch {
					// 在部分 Server 上下文中不可写 Cookie，忽略
				}
			},
		},
	});
}
