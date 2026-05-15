import { NextResponse } from "next/server";

import { getAuthEmailByUserId } from "@/lib/auth/profile-resolve";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ courseId: string }> };

export async function GET(_req: Request, { params }: Params) {
	const { courseId } = await params;
	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const baseSelect =
		"id,title,description,cover_image,instructor_label,mode,start_date,end_date,location,capacity,price,is_active,created_at";
	const withInstructorIdSelect = `${baseSelect},instructor_id`;

	let data: Record<string, unknown> | null = null;
	let error: { message: string } | null = null;

	const withIdRes = await srv
		.from("courses")
		.select(withInstructorIdSelect)
		.eq("id", courseId)
		.eq("is_active", true)
		.maybeSingle();
	if (withIdRes.error) {
		const fallbackRes = await srv
			.from("courses")
			.select(baseSelect)
			.eq("id", courseId)
			.eq("is_active", true)
			.maybeSingle();
		data = fallbackRes.data as Record<string, unknown> | null;
		error = fallbackRes.error;
	} else {
		data = withIdRes.data as Record<string, unknown> | null;
		error = withIdRes.error;
	}

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
	if (!data) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	const course: Record<string, unknown> = {
		...data,
		instructor_id: (data.instructor_id as string | null | undefined) ?? null,
	};

	const instructorId = course.instructor_id as string | null;
	if (instructorId) {
		const { data: profile } = await srv
			.from("profiles")
			.select("real_name, nickname")
			.eq("id", instructorId)
			.maybeSingle();
		const email = await getAuthEmailByUserId(srv, instructorId);
		const resolvedLabel =
			((profile?.real_name ?? profile?.nickname) as string | null) ||
			email ||
			null;
		if (resolvedLabel) {
			course.instructor_label = resolvedLabel;
		}
	}

	return NextResponse.json({ course });
}
