import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

const patchSchema = z
	.object({
		session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
		start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
		end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
		location: z.string().nullable().optional(),
	})
	.strict();

function normalizeTime(t: string | undefined): string | undefined {
	if (!t) return undefined;
	if (t.length === 5) return `${t}:00`;
	return t;
}

type RouteContext = { params: Promise<{ id: string }> };

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

	const updates: Record<string, unknown> = {};
	if (parsed.data.session_date) updates.date = parsed.data.session_date;
	if (parsed.data.start_time) updates.start_time = normalizeTime(parsed.data.start_time);
	if (parsed.data.end_time) updates.end_time = normalizeTime(parsed.data.end_time);
	if (parsed.data.location !== undefined) {
		updates.location = parsed.data.location === "" ? null : parsed.data.location;
	}

	if (Object.keys(updates).length === 0) {
		return NextResponse.json({ error: "No updates" }, { status: 400 });
	}

	const { data, error } = await supabase
		.from("course_schedules")
		.update(updates)
		.eq("id", id)
		.select()
		.maybeSingle();

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
	if (!data) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	return NextResponse.json({ session: data });
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

	const { error } = await supabase.from("course_schedules").delete().eq("id", id);

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	return NextResponse.json({ ok: true });
}
