import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

const patchSchema = z.object({
	status: z.enum(["pending", "reviewing", "approved", "rejected"]).optional(),
	progress: z
		.object({
			step: z.enum(["resume_screening", "interview", "assessment", "offer", "onboarded"]),
			status: z.enum(["pending", "completed", "rejected"]),
			notes: z.string().nullable().optional(),
		})
		.optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) {
		return gated;
	}

	const { id } = await params;
	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const { data: application, error: appErr } = await srv.from("job_applications").select("*").eq("id", id).maybeSingle();
	if (appErr) {
		return NextResponse.json({ error: appErr.message }, { status: 500 });
	}
	if (!application) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	const { data: progress, error: progErr } = await srv
		.from("job_progress")
		.select("*")
		.eq("application_id", id)
		.order("created_at", { ascending: true });

	if (progErr) {
		return NextResponse.json({ error: progErr.message }, { status: 500 });
	}

	return NextResponse.json({ application, progress: progress ?? [] });
}

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

	const { data: exists } = await srv.from("job_applications").select("id").eq("id", id).maybeSingle();
	if (!exists) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	if (parsed.data.status) {
		const { error } = await srv
			.from("job_applications")
			.update({ status: parsed.data.status, updated_at: new Date().toISOString() })
			.eq("id", id);
		if (error) {
			return NextResponse.json({ error: error.message }, { status: 500 });
		}
	}

	if (parsed.data.progress) {
		const { step, status, notes } = parsed.data.progress;
		const row = {
			application_id: id,
			step,
			status,
			notes: notes ?? null,
			updated_at: new Date().toISOString(),
		};
		const { error: upErr } = await srv.from("job_progress").upsert(row, {
			onConflict: "application_id,step",
		});
		if (upErr) {
			return NextResponse.json({ error: upErr.message }, { status: 500 });
		}
	}

	const { data: application } = await srv.from("job_applications").select("*").eq("id", id).maybeSingle();
	const { data: progress } = await srv
		.from("job_progress")
		.select("*")
		.eq("application_id", id)
		.order("created_at", { ascending: true });

	return NextResponse.json({ application, progress: progress ?? [] });
}
