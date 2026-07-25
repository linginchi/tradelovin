import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { isMissingRelationError } from "@/lib/video/db";

export const runtime = "nodejs";

const postSchema = z.object({
	title: z.string().min(1).max(200),
	description: z.string().max(2000).nullable().optional(),
	sort_order: z.number().int().min(0).max(10000).optional(),
	is_active: z.boolean().optional(),
	content_kind: z.enum(["ai_classic", "kol"]).optional(),
});

export async function GET() {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const { data, error } = await supabase
		.from("course_topics")
		.select("id, title, description, sort_order, is_active, content_kind, created_at")
		.order("sort_order", { ascending: true })
		.order("created_at", { ascending: true });

	if (error) {
		if (isMissingRelationError(error, "course_topics")) {
			return NextResponse.json({
				topics: [],
				warning: "主题表尚未初始化，请执行数据库迁移 course_topics。",
			});
		}
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	return NextResponse.json({ topics: data ?? [] });
}

export async function POST(req: Request) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

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

	const parsed = postSchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid body" }, { status: 400 });
	}

	const { data, error } = await supabase
		.from("course_topics")
		.insert({
			title: parsed.data.title.trim(),
			description: parsed.data.description?.trim() || null,
			sort_order: parsed.data.sort_order ?? 0,
			is_active: parsed.data.is_active ?? true,
			content_kind: parsed.data.content_kind ?? "kol",
		})
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

	return NextResponse.json({ topic: data });
}
