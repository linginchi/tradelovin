import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { awardPoints, TQ_POINTS_RULES } from "@/lib/membership/points";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

const jsonSchema = z.object({
	registrationId: z.string().uuid(),
	score: z.number().min(0).max(1000).optional(),
	grade: z.string().max(8).nullable().optional(),
	comment: z.string().max(2000).nullable().optional(),
	certificateUrl: z.string().max(2048).nullable().optional(),
});

export async function POST(req: Request) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) {
		return gated;
	}

	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const contentType = req.headers.get("content-type") ?? "";

	let registrationId: string;
	let score: number | null = null;
	let grade: string | null = null;
	let comment: string | null = null;
	let certificateUrl: string | null = null;

	if (contentType.includes("multipart/form-data")) {
		const form = await req.formData();
		const rid = form.get("registrationId");
		if (typeof rid !== "string" || !z.string().uuid().safeParse(rid).success) {
			return NextResponse.json({ error: "registrationId required" }, { status: 400 });
		}
		registrationId = rid;
		const scoreRaw = form.get("score");
		if (typeof scoreRaw === "string" && scoreRaw.trim() !== "") {
			const n = Number(scoreRaw);
			if (!Number.isFinite(n)) {
				return NextResponse.json({ error: "Invalid score" }, { status: 400 });
			}
			score = n;
		}
		const g = form.get("grade");
		grade = typeof g === "string" && g.trim() ? g.trim() : null;
		const c = form.get("comment");
		comment = typeof c === "string" && c.trim() ? c.trim() : null;
		const file = form.get("file");
		if (file instanceof File && file.size > 0) {
			const buf = Buffer.from(await file.arrayBuffer());
			const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
			const path = `${registrationId}/${Date.now()}-${safeName}`;
			const { error: upErr } = await srv.storage.from("course-certificates").upload(path, buf, {
				contentType: file.type || "application/octet-stream",
				upsert: false,
			});
			if (upErr) {
				return NextResponse.json({ error: upErr.message }, { status: 500 });
			}
			certificateUrl = path;
		}
	} else {
		let json: unknown;
		try {
			json = await req.json();
		} catch {
			return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
		}
		const parsed = jsonSchema.safeParse(json);
		if (!parsed.success) {
			return NextResponse.json({ error: "Invalid body" }, { status: 400 });
		}
		registrationId = parsed.data.registrationId;
		score = parsed.data.score ?? null;
		grade = parsed.data.grade ?? null;
		comment = parsed.data.comment ?? null;
		certificateUrl = parsed.data.certificateUrl ?? null;
	}

	const { data: reg } = await srv
		.from("course_registrations")
		.select("id,user_id")
		.eq("id", registrationId)
		.maybeSingle();
	if (!reg) {
		return NextResponse.json({ error: "Registration not found" }, { status: 404 });
	}

	const { data: inserted, error } = await srv
		.from("course_scores")
		.insert({
			registration_id: registrationId,
			score,
			grade,
			certificate_url: certificateUrl,
			comment,
		})
		.select()
		.maybeSingle();

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	const userId = reg.user_id as string | null;
	if (userId) {
		await awardPoints(srv, {
			userId,
			source: TQ_POINTS_RULES.courseUnitPassed.source,
			delta: TQ_POINTS_RULES.courseUnitPassed.points,
			dailyCap: TQ_POINTS_RULES.courseUnitPassed.dailyCap,
			referenceId: registrationId,
			metadata: { trigger: "course_score_uploaded" },
		});
	}

	return NextResponse.json({ score: inserted });
}
