import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminSession } from "@/lib/auth/admin-session";
import { getServiceSupabase } from "@/lib/supabase/service";

const patchSchema = z
	.object({
		real_name: z.string().nullable().optional(),
		nickname: z.string().min(1).optional(),
		email: z.string().email().optional(),
		phone: z.string().nullable().optional(),
		address: z.string().nullable().optional(),
		student_id: z.string().nullable().optional(),
		status: z.enum(["pending", "approved", "rejected"]).optional(),
		rejection_reason: z.string().nullable().optional(),
		learning_goals: z.string().nullable().optional(),
	})
	.strict();

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: RouteContext) {
	const session = await getAdminSession();
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

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
		if (updates[key] === undefined) {
			delete updates[key];
		}
	});

	if (Object.keys(updates).length === 0) {
		return NextResponse.json({ error: "No fields to update" }, { status: 400 });
	}

	const { data, error } = await supabase
		.from("registrations")
		.update(updates)
		.eq("id", id)
		.select()
		.maybeSingle();

	if (error) {
		if (error.code === "23505") {
			return NextResponse.json({ error: "Duplicate student_id or email" }, { status: 409 });
		}
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	if (!data) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	return NextResponse.json({ student: data });
}
