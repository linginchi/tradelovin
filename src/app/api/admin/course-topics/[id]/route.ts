import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

const topicIdSchema = z.string().uuid();
const updateTopicSchema = z
	.object({
		title: z.string().trim().min(1).max(200).optional(),
		description: z.string().trim().max(2000).nullable().optional(),
		sort_order: z.number().int().min(0).max(10000).optional(),
		is_active: z.boolean().optional(),
	})
	.strict();

type RouteContext = { params: Promise<{ id: string }> };

async function getTopicId(context: RouteContext): Promise<string | NextResponse> {
	const { id } = await context.params;
	if (!topicIdSchema.safeParse(id).success) {
		return NextResponse.json({ error: "Invalid id" }, { status: 400 });
	}
	return id;
}

export async function PATCH(request: Request, context: RouteContext) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

	const id = await getTopicId(context);
	if (id instanceof NextResponse) return id;

	const supabase = getServiceSupabase();
	if (!supabase) return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = updateTopicSchema.safeParse(body);
	if (!parsed.success || Object.keys(parsed.data).length === 0) {
		return NextResponse.json({ error: "Invalid body" }, { status: 400 });
	}

	const updates: Record<string, unknown> = { ...parsed.data };
	if (updates.description === "") updates.description = null;

	const { data, error } = await supabase
		.from("course_topics")
		.update(updates)
		.eq("id", id)
		.select("id, title, description, sort_order, is_active, created_at")
		.maybeSingle();

	if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
	return NextResponse.json({ topic: data });
}

export async function DELETE(_request: Request, context: RouteContext) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

	const id = await getTopicId(context);
	if (id instanceof NextResponse) return id;

	const supabase = getServiceSupabase();
	if (!supabase) return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });

	const { data, error } = await supabase.from("course_topics").delete().eq("id", id).select("id").maybeSingle();

	if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
	return NextResponse.json({ ok: true });
}
