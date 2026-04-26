import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminSession } from "@/lib/auth/admin-session";
import { getServiceSupabase } from "@/lib/supabase/service";

const postSchema = z.object({
	title: z.string().min(1),
	description: z.string().nullable().optional(),
	mode: z.enum(["online", "offline"]),
	capacity: z.number().int().positive().max(10000),
	instructor_id: z.string().uuid().nullable().optional(),
});

export async function GET() {
	const session = await getAdminSession();
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const { data: courses, error } = await supabase
		.from("courses")
		.select("*")
		.order("created_at", { ascending: false });

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	const { data: enrollRows } = await supabase.from("student_courses").select("course_id");

	const countByCourse = new Map<string, number>();
	for (const row of enrollRows ?? []) {
		const cid = row.course_id as string;
		countByCourse.set(cid, (countByCourse.get(cid) ?? 0) + 1);
	}

	const withCounts = (courses ?? []).map((c) => ({
		...c,
		enrollment_count: countByCourse.get(c.id) ?? 0,
	}));

	return NextResponse.json({ courses: withCounts });
}

export async function POST(req: Request) {
	const session = await getAdminSession();
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	let json: unknown;
	try {
		json = await req.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = postSchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid body" }, { status: 400 });
	}

	const insert: Record<string, unknown> = {
		title: parsed.data.title.trim(),
		description: parsed.data.description?.trim() || null,
		mode: parsed.data.mode,
		capacity: parsed.data.capacity,
	};
	if (parsed.data.instructor_id) insert.instructor_id = parsed.data.instructor_id;

	const { data, error } = await supabase.from("courses").insert(insert).select().maybeSingle();

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	return NextResponse.json({ course: { ...data, enrollment_count: 0 } });
}
