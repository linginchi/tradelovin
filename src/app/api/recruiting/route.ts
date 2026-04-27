import { NextResponse } from "next/server";

import {
	getServerSupabasePreferService,
	hasServiceRoleKey,
} from "@/lib/supabase/service";

/** 公开：当前启用的招生便利贴（最多一条，按 updated_at 最新） */
export async function GET() {
	const supabase = getServerSupabasePreferService();
	if (!supabase) {
		return NextResponse.json(
			{
				recruiting: null,
				error:
					"Server misconfigured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY)",
			},
			{ status: 503 },
		);
	}

	const canSeed = hasServiceRoleKey();

	const { count, error: countError } = await supabase
		.from("recruiting_info")
		.select("*", { count: "exact", head: true });

	if (countError) {
		console.error("Failed to count recruiting_info:", countError);
	} else if (canSeed && count === 0) {
		const { error: insertError } = await supabase.from("recruiting_info").insert({
			title: "日内基础入门营",
			description: "适合零基础，八周线上实训 + 模拟交易",
			start_date: "2026-05-10",
			enrollment_url: "/register",
			is_active: true,
		});
		if (insertError) {
			console.error("Failed to insert default recruiting info:", insertError);
		} else {
			console.log("Default recruiting info inserted");
		}
	}

	const { data, error } = await supabase
		.from("recruiting_info")
		.select("id, title, description, start_date, enrollment_url, is_active, created_at, updated_at")
		.eq("is_active", true)
		.order("updated_at", { ascending: false })
		.limit(1)
		.maybeSingle();

	if (error) {
		return NextResponse.json({ recruiting: null, error: error.message }, { status: 500 });
	}

	const headers = {
		"Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
	};

	return NextResponse.json({ recruiting: data ?? null }, { headers });
}
