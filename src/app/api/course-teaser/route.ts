import { NextResponse } from "next/server";

import {
	getServerSupabasePreferService,
	hasServiceRoleKey,
} from "@/lib/supabase/service";

const DEFAULT_CONTENT = "新一期的干货课程，敬请期待";

/** 公开：当前启用的预告文案（最多一条，按 updated_at 最新） */
export async function GET() {
	const supabase = getServerSupabasePreferService();
	if (!supabase) {
		return NextResponse.json(
			{
				content: null,
				error:
					"Server misconfigured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY)",
			},
			{ status: 503 },
		);
	}

	const canSeed = hasServiceRoleKey();

	const { count, error: countError } = await supabase
		.from("course_teaser")
		.select("*", { count: "exact", head: true });

	if (countError) {
		console.error("Failed to count course_teaser:", countError);
	} else if (canSeed && count === 0) {
		const { error: insertError } = await supabase.from("course_teaser").insert({
			content: DEFAULT_CONTENT,
			is_active: true,
		});
		if (insertError) {
			console.error("Failed to insert default course_teaser:", insertError);
		}
	}

	const { data, error } = await supabase
		.from("course_teaser")
		.select("content")
		.eq("is_active", true)
		.order("updated_at", { ascending: false })
		.limit(1)
		.maybeSingle();

	if (error) {
		return NextResponse.json({ content: null, error: error.message }, { status: 500 });
	}

	const content = data?.content?.trim() ? data.content : null;
	const headers = {
		"Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
	};

	return NextResponse.json({ content }, { headers });
}
