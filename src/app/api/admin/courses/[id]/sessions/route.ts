import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

const postSchema = z.object({
	session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
	end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
	location: z.string().nullable().optional(),
});

function normalizeTime(t: string): string {
	if (t.length === 5) return `${t}:00`;
	return t;
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: RouteContext) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const { id: courseId } = await ctx.params;
	if (!z.string().uuid().safeParse(courseId).success) {
		return NextResponse.json({ error: "Invalid course id" }, { status: 400 });
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

	const { data, error } = await supabase
		.from("course_schedules")
		.insert({
			course_id: courseId,
			date: parsed.data.session_date,
			start_time: normalizeTime(parsed.data.start_time),
			end_time: normalizeTime(parsed.data.end_time),
			location: parsed.data.location?.trim() || null,
		})
		.select()
		.maybeSingle();

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	return NextResponse.json({ session: data });
}
