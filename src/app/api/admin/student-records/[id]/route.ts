import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

const patchSchema = z
	.object({
		payment_status: z.enum(["paid", "unpaid", "refunded"]).optional(),
	})
	.strict();

type RouteContext = { params: Promise<{ id: string }> };

/** id = profiles.id（正式学员）；将名下所有选课记录批量更新为同一缴费状态 */
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

	const updates = { ...parsed.data };
	Object.keys(updates).forEach((k) => {
		const key = k as keyof typeof updates;
		if (updates[key] === undefined) delete updates[key];
	});

	if (Object.keys(updates).length === 0) {
		return NextResponse.json({ error: "No updates" }, { status: 400 });
	}

	const { data: profile, error: profErr } = await supabase
		.from("profiles")
		.select("id, student_id")
		.eq("id", id)
		.maybeSingle();

	if (profErr) {
		return NextResponse.json({ error: profErr.message }, { status: 500 });
	}
	if (!profile?.student_id) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	if (parsed.data.payment_status) {
		const { error: scErr } = await supabase
			.from("student_courses")
			.update({ payment_status: parsed.data.payment_status })
			.eq("student_id", id);

		if (scErr) {
			return NextResponse.json({ error: scErr.message }, { status: 500 });
		}
	}

	const { data, error } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	return NextResponse.json({ student: data });
}
