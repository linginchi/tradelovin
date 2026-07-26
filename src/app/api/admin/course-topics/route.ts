import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

const createTopicSchema = z
	.object({
		title: z.string().trim().min(1).max(200),
		description: z.string().trim().max(2000).nullable().optional(),
		sort_order: z.number().int().min(0).max(10000).optional(),
		is_active: z.boolean().optional(),
	})
	.strict();

export async function GET() {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

	const supabase = getServiceSupabase();
	if (!supabase) return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });

	const { data, error } = await supabase
		.from("course_topics")
		.select("id, title, description, sort_order, is_active, created_at")
		.order("sort_order", { ascending: true })
		.order("created_at", { ascending: true });

	if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	return NextResponse.json({ topics: data ?? [] });
}

export async function POST(request: Request) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

	const supabase = getServiceSupabase();
	if (!supabase) return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = createTopicSchema.safeParse(body);
	if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

	const { data, error } = await supabase
		.from("course_topics")
		.insert({
			title: parsed.data.title,
			description: parsed.data.description || null,
			sort_order: parsed.data.sort_order ?? 0,
			is_active: parsed.data.is_active ?? true,
		})
		.select("id, title, description, sort_order, is_active, created_at")
		.maybeSingle();

	if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	return NextResponse.json({ topic: data }, { status: 201 });
}
