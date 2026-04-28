import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getAuthEmailsByUserIds } from "@/lib/auth/profile-resolve";
import { getServiceSupabase } from "@/lib/supabase/service";

const patchSchema = z
	.object({
		title: z.string().min(1).optional(),
		description: z.string().nullable().optional(),
		mode: z.enum(["online", "offline"]).optional(),
		capacity: z.number().int().positive().max(10000).optional(),
		instructor_id: z.string().uuid().nullable().optional(),
	})
	.strict();

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: RouteContext) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const { id } = await ctx.params;
	if (!z.string().uuid().safeParse(id).success) {
		return NextResponse.json({ error: "Invalid id" }, { status: 400 });
	}

	const { data: course, error } = await supabase.from("courses").select("*").eq("id", id).maybeSingle();

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
	if (!course) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	const { data: sessions } = await supabase
		.from("course_schedules")
		.select("*")
		.eq("course_id", id)
		.order("date", { ascending: true })
		.order("start_time", { ascending: true });

	const instructorId = course.instructor_id as string | null;
	let instructor: { id: string; name: string } | null = null;
	if (instructorId) {
		const { data: ins } = await supabase
			.from("profiles")
			.select("id, real_name, nickname")
			.eq("id", instructorId)
			.maybeSingle();
		if (ins) {
			instructor = {
				id: ins.id as string,
				name: ((ins.real_name ?? ins.nickname) as string) || "—",
			};
		}
	}

	const { data: enrollments } = await supabase
		.from("student_courses")
		.select("id, student_id")
		.eq("course_id", id);

	const studIds = [...new Set((enrollments ?? []).map((e) => e.student_id as string))];
	type StudRow = {
		id: string;
		student_id: string;
		nickname: string | null;
		real_name: string | null;
		email: string;
	};
	const { data: studRowsRaw } =
		studIds.length > 0
			? await supabase
					.from("profiles")
					.select("id, student_id, nickname, real_name")
					.in("id", studIds)
			: { data: [] as Omit<StudRow, "email">[] };

	const studEmailMap = await getAuthEmailsByUserIds(supabase, studIds);
	const studRows: StudRow[] = (studRowsRaw ?? []).map((s) => ({
		...s,
		email: studEmailMap.get(s.id as string) ?? "",
	})) as StudRow[];

	const studMap = new Map(studRows.map((s) => [s.id, s]));

	const enrollmentCount = enrollments?.length ?? 0;

	return NextResponse.json({
		course,
		sessions: sessions ?? [],
		instructor_id: instructorId,
		instructor,
		enrollments: (enrollments ?? []).map((e) => {
			const s = studMap.get(e.student_id as string);
			return {
				id: e.id,
				student_record_id: e.student_id,
				student: s
					? {
							student_id: s.student_id,
							nickname: (s.nickname ?? s.real_name) as string | null,
							email: s.email as string,
						}
					: null,
			};
		}),
		enrollment_count: enrollmentCount,
	});
}

export async function PATCH(req: Request, ctx: RouteContext) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const { id } = await ctx.params;
	if (!z.string().uuid().safeParse(id).success) {
		return NextResponse.json({ error: "Invalid id" }, { status: 400 });
	}

	let json: unknown;
	try {
		json = await req.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = patchSchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid body" }, { status: 400 });
	}

	const updates: Record<string, unknown> = { ...parsed.data };
	if (updates.description === "") updates.description = null;
	Object.keys(updates).forEach((k) => {
		if (updates[k] === undefined) delete updates[k];
	});

	const { data, error } = await supabase.from("courses").update(updates).eq("id", id).select().maybeSingle();

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
	if (!data) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	return NextResponse.json({ course: data });
}

export async function DELETE(_req: Request, ctx: RouteContext) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const { id } = await ctx.params;
	if (!z.string().uuid().safeParse(id).success) {
		return NextResponse.json({ error: "Invalid id" }, { status: 400 });
	}

	const { error } = await supabase.from("courses").delete().eq("id", id);

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	return NextResponse.json({ ok: true });
}
