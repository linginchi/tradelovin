import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type TradeAuthedContext = {
	supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
	userId: string;
};

/** 未配置 Supabase 环境变量时返回 503。 */
export async function requireTradeUser(): Promise<TradeAuthedContext | NextResponse> {
	try {
		if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
			return NextResponse.json(
				{ success: false, error: "服务端未配置 Supabase" },
				{ status: 503 },
			);
		}
		const supabase = await createServerSupabaseClient();
		const {
			data: { user },
			error,
		} = await supabase.auth.getUser();
		if (error || !user) {
			return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
		}
		return { supabase, userId: user.id };
	} catch {
		return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
	}
}
