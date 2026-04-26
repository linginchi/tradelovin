import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";

import { getAdminSession } from "@/lib/auth/admin-session";
import { getServiceSupabase } from "@/lib/supabase/service";

const bodySchema = z.object({
	student_record_ids: z.array(z.string().uuid()).min(1),
	subject: z.string().min(1),
	body: z.string().min(1),
	html: z.string().optional(),
});

export async function POST(req: Request) {
	const session = await getAdminSession();
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const resendKey = process.env.RESEND_API_KEY;
	const from = process.env.RESEND_FROM_EMAIL;
	if (!resendKey || !from) {
		return NextResponse.json({ error: "Email not configured" }, { status: 503 });
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

	const { data: rows, error: qErr } = await supabase
		.from("profiles")
		.select("id, email")
		.in("id", parsed.data.student_record_ids)
		.not("student_id", "is", null);

	if (qErr) {
		return NextResponse.json({ error: qErr.message }, { status: 500 });
	}

	const approved = rows ?? [];

	if (approved.length === 0) {
		return NextResponse.json({ error: "No matching students" }, { status: 400 });
	}

	const resend = new Resend(resendKey);
	const now = new Date().toISOString();
	let sent = 0;
	const errors: string[] = [];

	for (const row of approved) {
		const email = row.email as string;
		const { error: sendErr } = await resend.emails.send({
			from,
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
