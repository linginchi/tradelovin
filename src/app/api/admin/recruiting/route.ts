import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSuperAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

const putSchema = z.object({
	title: z.string().min(1),
	description: z.string().optional().nullable(),
	start_date: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional()
		.nullable(),
	enrollment_url: z.string().min(1).default("/register"),
	is_active: z.boolean().default(true),
});

/** 超级管理员：读取当前编辑用的一条记录（按 updated_at 最新） */
export async function GET() {
	const gated = await requireSuperAdminSession();
	if (gated instanceof NextResponse) return gated;

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const { data, error } = await supabase
		.from("recruiting_info")
		.select("id, course_id, title, description, start_date, enrollment_url, is_active, updated_at")
		.order("updated_at", { ascending: false })
		.limit(1)
		.maybeSingle();

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	return NextResponse.json({ recruiting: data ?? null });
}

export async function PUT(req: Request) {
	const gated = await requireSuperAdminSession();
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

	const parsed = putSchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid body" }, { status: 400 });
	}

	const now = new Date().toISOString();
	const payload = {
		title: parsed.data.title,
		description: parsed.data.description ?? null,
		start_date: parsed.data.start_date ?? null,
		enrollment_url: parsed.data.enrollment_url,
		is_active: parsed.data.is_active,
		updated_at: now,
	};

	const { data: existing } = await supabase.from("recruiting_info").select("id").limit(1).maybeSingle();

	if (existing?.id) {
		const { data, error } = await supabase
			.from("recruiting_info")
			.update(payload)
			.eq("id", existing.id)
			.select()
			.single();

		if (error) {
			return NextResponse.json({ error: error.message }, { status: 500 });
		}
		return NextResponse.json({ recruiting: data });
	}

	const { data, error } = await supabase.from("recruiting_info").insert(payload).select().single();

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
	return NextResponse.json({ recruiting: data });
}
