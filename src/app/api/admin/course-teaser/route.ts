import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSuperAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

const putSchema = z.object({
	content: z.string().min(1),
	is_active: z.boolean().default(true),
});

export async function GET() {
	const gated = await requireSuperAdminSession();
	if (gated instanceof NextResponse) return gated;

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const { data, error } = await supabase
		.from("course_teaser")
		.select("id, content, is_active, updated_at")
		.order("updated_at", { ascending: false })
		.limit(1)
		.maybeSingle();

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	return NextResponse.json({ teaser: data ?? null });
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
		content: parsed.data.content.trim(),
		is_active: parsed.data.is_active,
		updated_at: now,
	};

	const { data: existing } = await supabase
		.from("course_teaser")
		.select("id")
		.limit(1)
		.maybeSingle();

	if (existing?.id) {
		const { data, error } = await supabase
			.from("course_teaser")
			.update(payload)
			.eq("id", existing.id)
			.select("id, content, is_active, updated_at")
			.single();

		if (error) {
			return NextResponse.json({ error: error.message }, { status: 500 });
		}
		return NextResponse.json({ teaser: data });
	}

	const { data, error } = await supabase
		.from("course_teaser")
		.insert(payload)
		.select("id, content, is_active, updated_at")
		.single();

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
	return NextResponse.json({ teaser: data });
}
