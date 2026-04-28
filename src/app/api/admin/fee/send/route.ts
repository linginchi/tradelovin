import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getAuthEmailsByUserIds } from "@/lib/auth/profile-resolve";
import { resolveResendEnv } from "@/lib/email/resend-config";
import { getServiceSupabase } from "@/lib/supabase/service";

const bodySchema = z
	.object({
		student_record_ids: z.array(z.string().uuid()).optional(),
		enrollment_ids: z.array(z.string().uuid()).optional(),
		subject: z.string().min(1),
		body: z.string().min(1),
		html: z.string().optional(),
	})
	.refine((b) => (b.student_record_ids?.length ?? 0) + (b.enrollment_ids?.length ?? 0) > 0, {
		message: "student_record_ids or enrollment_ids required",
	});

export async function POST(req: Request) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;
	const { session } = gated;

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const resendCfg = resolveResendEnv();
	if (!resendCfg.ok) {
		return NextResponse.json(
			{
				error: resendCfg.errorEn,
				errorZh: resendCfg.error,
				code: resendCfg.code,
				missing: resendCfg.missing,
			},
			{ status: 503 },
		);
	}

	let json: unknown;
	try {
		json = await req.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = bodySchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid body" }, { status: 400 });
	}

	let profileIds = parsed.data.student_record_ids ?? [];
	if (parsed.data.enrollment_ids?.length) {
		const { data: scRows, error: scErr } = await supabase
			.from("student_courses")
			.select("student_id")
			.in("id", parsed.data.enrollment_ids);
		if (scErr) {
			return NextResponse.json({ error: scErr.message }, { status: 500 });
		}
		profileIds = [...new Set([...profileIds, ...(scRows ?? []).map((r) => r.student_id as string)])];
	}

	const { data: rows, error: qErr } = await supabase
		.from("profiles")
		.select("id")
		.in("id", profileIds)
		.not("student_id", "is", null);

	if (qErr) {
		return NextResponse.json({ error: qErr.message }, { status: 500 });
	}

	const approved = rows ?? [];

	if (approved.length === 0) {
		return NextResponse.json({ error: "No matching students" }, { status: 400 });
	}

	const emailByProfileId = await getAuthEmailsByUserIds(
		supabase,
		approved.map((r) => r.id as string),
	);

	const resend = new Resend(resendCfg.apiKey);
	const now = new Date().toISOString();
	let sent = 0;
	const errors: string[] = [];

	for (const row of approved) {
		const email = emailByProfileId.get(row.id as string) ?? "";
		if (!email) {
			errors.push(`${row.id as string}: no auth email`);
			continue;
		}
		const { error: sendErr } = await resend.emails.send({
			from: resendCfg.from,
			to: email,
			subject: parsed.data.subject,
			text: parsed.data.body,
			...(parsed.data.html ? { html: parsed.data.html } : {}),
		});
		if (sendErr) {
			errors.push(`${email}: ${sendErr.message}`);
			continue;
		}
		sent++;
		await supabase.from("profiles").update({ fee_notice_sent_at: now }).eq("id", row.id as string);
	}

	await supabase.from("fee_email_logs").insert({
		sent_by: session.email,
		subject: parsed.data.subject,
		body: parsed.data.body,
		student_ids: approved.map((r) => r.id as string),
	});

	return NextResponse.json({
		ok: true,
		sent,
		failed: errors.length,
		errors: errors.slice(0, 10),
	});
}
