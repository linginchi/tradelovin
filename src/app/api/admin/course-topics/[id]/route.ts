import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { isMissingRelationError } from "@/lib/video/db";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z
	.object({
		title: z.string().min(1).max(200).optional(),
		description: z.string().max(2000).nullable().optional(),
		sort_order: z.number().int().min(0).max(10000).optional(),
		is_active: z.boolean().optional(),
	})
	.strict();

export async function PUT(req: Request, { params }: RouteContext) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

	const { id } = await params;
	if (!z.string().uuid().safeParse(id).success) {
		return NextResponse.json({ error: "Invalid id" }, { status: 400 });
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

	const parsed = patchSchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid body" }, { status: 400 });
	}

	const updates: Record<string, unknown> = { ...parsed.data };
	if (updates.title !== undefined) updates.title = String(updates.title).trim();
	if (updates.description === "") updates.description = null;
	if (updates.description !== undefined && updates.description !== null) {
		updates.description = String(updates.description).trim() || null;
	}
	Object.keys(updates).forEach((k) => {
		if (updates[k] === undefined) delete updates[k];
	});

	if (Object.keys(updates).length === 0) {
		return NextResponse.json({ error: "No fields to update" }, { status: 400 });
	}

	const { data, error } = await supabase
		.from("course_topics")
		.update(updates)
		.eq("id", id)
		.select()
		.maybeSingle();

	if (error) {
		if (isMissingRelationError(error, "course_topics")) {
			return NextResponse.json(
				{ error: "主题表尚未初始化，请执行数据库迁移 course_topics。" },
				{ status: 503 },
			);
		}
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
	if (!data) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	return NextResponse.json({ topic: data });
}

export async function DELETE(_req: Request, { params }: RouteContext) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

	const { id } = await params;
	if (!z.string().uuid().safeParse(id).success) {
		return NextResponse.json({ error: "Invalid id" }, { status: 400 });
	}

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const { error } = await supabase.from("course_topics").delete().eq("id", id);

	if (error) {
		if (isMissingRelationError(error, "course_topics")) {
			return NextResponse.json(
				{ error: "主题表尚未初始化，请执行数据库迁移 course_topics。" },
				{ status: 503 },
			);
		}
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	return NextResponse.json({ ok: true });
}
