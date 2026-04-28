import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

const patchSchema = z.object({
	status: z.enum(["pending", "approved", "rejected"]),
	notes: z.string().nullable().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) {
		return gated;
	}

	const { id } = await params;
	const srv = getServiceSupabase();
	if (!srv) {
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

	const updates: Record<string, unknown> = {
		status: parsed.data.status,
		reviewed_at: new Date().toISOString(),
	};
	if (parsed.data.notes !== undefined) {
		updates.notes =
			parsed.data.notes && parsed.data.notes.trim() !== ""
				? `${parsed.data.notes.trim()} [admin:${gated.session.email}]`
				: null;
	}

	const { data, error } = await srv
		.from("course_registrations")
		.update(updates)
		.eq("id", id)
		.select()
		.maybeSingle();

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
	if (!data) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	return NextResponse.json({ registration: data });
}
