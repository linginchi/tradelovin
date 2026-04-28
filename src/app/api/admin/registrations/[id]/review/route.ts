import { NextResponse } from "next/server";
import { z } from "zod";

import { nextBdStudentId } from "@/lib/admin/student-code";
import { getReviewerProfileId } from "@/lib/admin/reviewer-profile";
import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getAuthUserIdByEmail } from "@/lib/auth/profile-resolve";
import { sendAdminEmail } from "@/lib/email/admin-mail";
import { getServiceSupabase } from "@/lib/supabase/service";

const bodySchema = z.discriminatedUnion("action", [
	z.object({
		action: z.literal("approve"),
	}),
	z.object({
		action: z.literal("reject"),
		reason: z.string().min(1, "reason required"),
	}),
]);

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: RouteContext) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;
	const { session } = gated;

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const { id } = await ctx.params;
	if (!z.string().uuid().safeParse(id).success) {
		return NextResponse.json({ error: "Invalid id" }, { status: 400 });
	}

	let json: unknown;
	try {
		json = await req.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = bodySchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
	}

	const { data: reg, error: regErr } = await supabase
		.from("registrations")
		.select("*")
		.eq("id", id)
		.maybeSingle();

	if (regErr || !reg) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	if (reg.status !== "pending") {
		return NextResponse.json({ error: "Registration is not pending review" }, { status: 400 });
	}

	const reviewerId = await getReviewerProfileId(supabase, session.email);
	const reviewedAt = new Date().toISOString();

	if (parsed.data.action === "reject") {
		const { error } = await supabase
			.from("registrations")
			.update({
				status: "rejected",
				rejection_reason: parsed.data.reason,
				reviewed_by: reviewerId,
				reviewed_at: reviewedAt,
			})
			.eq("id", id);

		if (error) {
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		const to = String(reg.email ?? "").trim();
		if (to) {
			const sent = await sendAdminEmail({
				to,
				subject: "报名审核未通过 · 豹仔乐园",
				text: `您好，\n\n很抱歉，您的课程报名未通过审核。\n\n原因：${parsed.data.reason}\n\n如有疑问请回复本邮件联系工作人员。\n`,
			});
			if (!sent.ok) {
				return NextResponse.json({
					ok: true,
					registration: { id, status: "rejected" },
					emailWarning: sent.message,
				});
			}
		}

		return NextResponse.json({ ok: true, registration: { id, status: "rejected" } });
	}

	const regEmail = String(reg.email ?? "")
		.trim()
		.toLowerCase();
	const applicantUid =
		(reg.user_id as string | null) && String(reg.user_id).length > 0
			? (reg.user_id as string)
			: await getAuthUserIdByEmail(supabase, regEmail);

	if (!applicantUid) {
		return NextResponse.json(
			{ error: "未找到对应登录账号，无法核准（需学员已注册 auth 用户）" },
			{ status: 400 },
		);
	}

	const { data: existingProfile } = await supabase
		.from("profiles")
		.select("id, student_id")
		.eq("id", applicantUid)
		.not("student_id", "is", null)
		.maybeSingle();

	if (existingProfile?.student_id) {
		return NextResponse.json(
			{ error: "Student profile already exists", student_id: existingProfile.student_id },
			{ status: 409 },
		);
	}

	let code: string;
	try {
		code = await nextBdStudentId(supabase);
	} catch (e) {
		return NextResponse.json(
			{ error: e instanceof Error ? e.message : "Could not allocate student id" },
			{ status: 500 },
		);
	}

	const { data: upserted, error: insErr } = await supabase
		.from("profiles")
		.upsert(
			{
				id: applicantUid,
				real_name: reg.real_name as string | null,
				nickname: reg.nickname as string | null,
				phone: reg.phone as string | null,
				address: reg.address as string | null,
				student_id: code,
				role: "user",
				specialties: [],
				is_instructor: false,
			},
			{ onConflict: "id" },
		)
		.select()
		.maybeSingle();

	if (insErr) {
		return NextResponse.json({ error: insErr.message }, { status: 500 });
	}

	const { error: updErr } = await supabase
		.from("registrations")
		.update({
			status: "approved",
			student_id: code,
			rejection_reason: null,
			reviewed_by: reviewerId,
			reviewed_at: reviewedAt,
		})
		.eq("id", id);

	if (updErr) {
		return NextResponse.json({ error: updErr.message }, { status: 500 });
	}

	return NextResponse.json({
		ok: true,
		registration: { id, status: "approved", student_id: code },
		profile: upserted,
	});
}
