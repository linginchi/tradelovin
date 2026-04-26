import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

const postSchema = z.object({
	course_id: z.string().uuid(),
	student_record_id: z.string().uuid(),
	schedule_id: z.string().uuid().nullable().optional(),
});

export async function POST(req: Request) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

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

	const { data: course } = await supabase
		.from("courses")
		.select("id, capacity")
		.eq("id", parsed.data.course_id)
		.maybeSingle();

	if (!course) {
		return NextResponse.json({ error: "Course not found" }, { status: 404 });
	}

	const { data: stud } = await supabase
		.from("profiles")
		.select("id, student_id")
		.eq("id", parsed.data.student_record_id)
		.maybeSingle();

	if (!stud?.student_id) {
		return NextResponse.json({ error: "Student profile not found or not approved" }, { status: 404 });
	}

	const { count } = await supabase
		.from("student_courses")
		.select("id", { count: "exact", head: true })
		.eq("course_id", parsed.data.course_id);

	if ((count ?? 0) >= (course.capacity as number)) {
		return NextResponse.json({ error: "Course is full" }, { status: 400 });
	}

	const insertRow: Record<string, unknown> = {
		course_id: parsed.data.course_id,
		student_id: parsed.data.student_record_id,
	};
	if (parsed.data.schedule_id) insertRow.schedule_id = parsed.data.schedule_id;

	const { data, error } = await supabase.from("student_courses").insert(insertRow).select().maybeSingle();

	if (error) {
		if (error.code === "23505") {
			return NextResponse.json({ error: "Already enrolled" }, { status: 409 });
		}
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	return NextResponse.json({ enrollment: data });
}

export async function DELETE(req: Request) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const id = new URL(req.url).searchParams.get("id");
	if (!id || !z.string().uuid().safeParse(id).success) {
		return NextResponse.json({ error: "Missing or invalid id" }, { status: 400 });
	}

	const { error } = await supabase.from("student_courses").delete().eq("id", id);

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	return NextResponse.json({ ok: true });
}
