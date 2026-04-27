import { NextResponse } from "next/server";

import { getServiceSupabase } from "@/lib/supabase/service";

/** 公开：当前启用的招生便利贴（最多一条，按 updated_at 最新） */
export async function GET() {
	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ recruiting: null, error: "Server misconfigured" }, { status: 503 });
	}

	const { data, error } = await supabase
		.from("recruiting_info")
		.select("id, course_id, title, description, start_date, enrollment_url, is_active, updated_at")
		.eq("is_active", true)
		.order("updated_at", { ascending: false })
		.limit(1)
		.maybeSingle();

	if (error) {
		return NextResponse.json({ recruiting: null, error: error.message }, { status: 500 });
	}

	return NextResponse.json({ recruiting: data ?? null });
}
