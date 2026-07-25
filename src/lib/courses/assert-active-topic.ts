import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Validates that a non-null topic_id refers to an existing, active course topic.
 * Callers must skip this when topic_id is null (clear) or omitted (leave unchanged).
 */
export async function assertActiveCourseTopic(
	supabase: SupabaseClient,
	topicId: string,
): Promise<NextResponse | null> {
	const { data, error } = await supabase
		.from("course_topics")
		.select("id, is_active")
		.eq("id", topicId)
		.maybeSingle();

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
	if (!data) {
		return NextResponse.json({ error: "Topic not found" }, { status: 400 });
	}
	if (!data.is_active) {
		return NextResponse.json({ error: "Topic is inactive" }, { status: 400 });
	}
	return null;
}
