import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getAuthEmailByUserId } from "@/lib/auth/profile-resolve";
import { getServiceSupabase } from "@/lib/supabase/service";

const patchSchema = z
	.object({
		name: z.string().min(1).optional(),
		email: z.string().email().nullable().optional(),
		bio: z.string().nullable().optional(),
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
	if (parsed.data.name !== undefined) updates.real_name = parsed.data.name.trim();
	if (parsed.data.bio !== undefined) updates.bio = parsed.data.bio === "" ? null : parsed.data.bio;

	Object.keys(updates).forEach((k) => {
		if (updates[k] === undefined) delete updates[k];
	});

	let emailUpdated = false;
	if (parsed.data.email !== undefined) {
		const raw = parsed.data.email;
		if (raw === null || raw === "") {
			return NextResponse.json({ error: "邮箱不可清空；请在 Supabase Auth 中处理" }, { status: 400 });
		}
		const { error: aErr } = await supabase.auth.admin.updateUserById(id, {
			email: raw.trim().toLowerCase(),
		});
		if (aErr) {
			return NextResponse.json({ error: aErr.message }, { status: 400 });
		}
		emailUpdated = true;
	}

	if (Object.keys(updates).length === 0 && !emailUpdated) {
		return NextResponse.json({ error: "No updates" }, { status: 400 });
	}

	let data: Record<string, unknown> | null = null;
	let error: { message: string } | null = null;

	if (Object.keys(updates).length > 0) {
		const res = await supabase
			.from("profiles")
			.update(updates)
			.eq("id", id)
			.eq("role", "instructor")
			.select()
			.maybeSingle();
		data = res.data as Record<string, unknown> | null;
		error = res.error;
	} else {
		const res = await supabase
			.from("profiles")
			.select()
			.eq("id", id)
			.eq("role", "instructor")
			.maybeSingle();
		data = res.data as Record<string, unknown> | null;
		error = res.error;
	}

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
	if (!data) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	const row = data as unknown as {
		id: string;
		real_name: string | null;
		nickname: string | null;
		avatar_url: string | null;
		bio: string | null;
	};

	const contactEmail = await getAuthEmailByUserId(supabase, row.id);

	return NextResponse.json({
		instructor: {
			id: row.id,
			name: row.real_name ?? row.nickname ?? "—",
			email: contactEmail,
			avatar_url: row.avatar_url,
			bio: row.bio,
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
		.eq("role", "instructor")
		.maybeSingle();

	if (selErr) {
		return NextResponse.json({ error: selErr.message }, { status: 500 });
	}
	if (!row) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	if (row.student_id) {
		const { error } = await supabase.from("profiles").update({ role: "user" }).eq("id", id);
		if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	} else {
		const { error } = await supabase.from("profiles").delete().eq("id", id);
		if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	}

	return NextResponse.json({ ok: true });
}
