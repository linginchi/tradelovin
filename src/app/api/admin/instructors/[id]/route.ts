import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "edge";

const patchSchema = z
	.object({
		name: z.string().min(1).optional(),
		email: z.string().email().nullable().optional(),
		bio: z.string().nullable().optional(),
		specialties: z.array(z.string()).optional(),
	})
	.strict();

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
	if (parsed.data.name !== undefined) updates.full_name = parsed.data.name.trim();
	if (parsed.data.email !== undefined) {
		updates.email = parsed.data.email === null || parsed.data.email === "" ? null : parsed.data.email.trim().toLowerCase();
	}
	if (parsed.data.bio !== undefined) updates.bio = parsed.data.bio === "" ? null : parsed.data.bio;
	if (parsed.data.specialties !== undefined) updates.specialties = parsed.data.specialties;

	Object.keys(updates).forEach((k) => {
		if (updates[k] === undefined) delete updates[k];
	});

	if (Object.keys(updates).length === 0) {
		return NextResponse.json({ error: "No updates" }, { status: 400 });
	}

	const { data, error } = await supabase
		.from("profiles")
		.update(updates)
		.eq("id", id)
		.eq("is_instructor", true)
		.select()
		.maybeSingle();

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
	if (!data) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	const row = data as {
		id: string;
		full_name: string | null;
		nickname: string | null;
		email: string | null;
		avatar_url: string | null;
		bio: string | null;
		specialties: string[];
	};

	return NextResponse.json({
		instructor: {
			id: row.id,
			name: row.full_name ?? row.nickname ?? "—",
			email: row.email,
			avatar_url: row.avatar_url,
			bio: row.bio,
			specialties: row.specialties ?? [],
		},
	});
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

	const { data: row, error: selErr } = await supabase
		.from("profiles")
		.select("student_id")
		.eq("id", id)
		.eq("is_instructor", true)
		.maybeSingle();

	if (selErr) {
		return NextResponse.json({ error: selErr.message }, { status: 500 });
	}
	if (!row) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	if (row.student_id) {
		const { error } = await supabase.from("profiles").update({ is_instructor: false }).eq("id", id);
		if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	} else {
		const { error } = await supabase.from("profiles").delete().eq("id", id);
		if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	}

	return NextResponse.json({ ok: true });
}
