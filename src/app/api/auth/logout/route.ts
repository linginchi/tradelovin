import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
	try {
		const supabase = await createServerSupabaseClient();
		await supabase.auth.signOut();
	} catch {
		// 忽略清理异常，始终返回成功，前端按已退出处理。
	}

	return NextResponse.json({ success: true }, { status: 200 });
}
