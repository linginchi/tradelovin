import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET() {
	const srv = getServiceSupabase();
	if (!srv) return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });

	const { data: topics, error } = await srv
		.from("course_topics")
		.select("id, title, description, sort_order")
		.eq("is_active", true)
		.order("sort_order", { ascending: true })
		.order("created_at", { ascending: true });
	if (error) return NextResponse.json({ error: error.message }, { status: 500 });

	const ids = (topics ?? []).map((t) => t.id as string);
	let counts = new Map<string, number>();
	if (ids.length) {
		const { data: courses } = await srv
			.from("courses")
			.select("topic_id")
			.eq("is_active", true)
			.in("topic_id", ids);
		counts = new Map();
		for (const row of courses ?? []) {
			const tid = row.topic_id as string | null;
			if (!tid) continue;
			counts.set(tid, (counts.get(tid) ?? 0) + 1);
		}
	}

	return NextResponse.json({
		topics: (topics ?? []).map((t) => ({
			...t,
			courseCount: counts.get(t.id as string) ?? 0,
		})),
	});
}
