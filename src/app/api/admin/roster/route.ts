import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getAuthEmailsByUserIds } from "@/lib/auth/profile-resolve";
import { getServiceSupabase } from "@/lib/supabase/service";

function aggregatePayment(rows: { payment_status: string }[]): "paid" | "unpaid" | "refunded" {
	if (rows.length === 0) return "unpaid";
	const allPaid = rows.every((r) => r.payment_status === "paid");
	if (allPaid) return "paid";
	const anyRefunded = rows.some((r) => r.payment_status === "refunded");
	if (anyRefunded && rows.every((r) => r.payment_status === "refunded" || r.payment_status === "paid")) {
		return "refunded";
	}
	return "unpaid";
}

/** 已审核学员；支持按学员汇总（默认）或按选课明细（收费管理） */
export async function GET(req: Request) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const { searchParams } = new URL(req.url);
	const view = (searchParams.get("view") ?? "student").trim();
	const courseId = (searchParams.get("course_id") ?? "").trim();
	const paymentStatus = (searchParams.get("payment_status") ?? "").trim();
	const from = (searchParams.get("from") ?? "").trim();
	const to = (searchParams.get("to") ?? "").trim();

	if (view === "enrollment") {
		let q = supabase
			.from("student_courses")
			.select("id, student_id, course_id, enrollment_date, payment_status, refund_reason")
			.order("enrollment_date", { ascending: false });

		if (courseId && /^[0-9a-f-]{36}$/i.test(courseId)) {
			q = q.eq("course_id", courseId);
		}
		if (paymentStatus === "paid" || paymentStatus === "unpaid" || paymentStatus === "refunded") {
			q = q.eq("payment_status", paymentStatus);
		}
		if (from) {
			q = q.gte("enrollment_date", `${from}T00:00:00.000Z`);
		}
		if (to) {
			q = q.lte("enrollment_date", `${to}T23:59:59.999Z`);
		}

		const { data: rows, error } = await q;

		if (error) {
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		const list = rows ?? [];
		const courseIds = [...new Set(list.map((r) => r.course_id as string))];
		const studIds = [...new Set(list.map((r) => r.student_id as string))];

		const courseTitle = new Map<string, string>();
		if (courseIds.length > 0) {
			const { data: courses } = await supabase.from("courses").select("id, title").in("id", courseIds);
			for (const c of courses ?? []) {
				courseTitle.set(c.id as string, (c.title as string) ?? "—");
			}
		}

		const profById = new Map<string, Record<string, unknown>>();
		if (studIds.length > 0) {
			const { data: profs } = await supabase
				.from("profiles")
				.select("id, student_id, nickname, real_name")
				.in("id", studIds);
			for (const p of profs ?? []) {
				profById.set(p.id as string, p as Record<string, unknown>);
			}
		}
		const studEmailMap = await getAuthEmailsByUserIds(supabase, studIds);

		const enrollments = list.map((row) => {
			const sid = row.student_id as string;
			const prof = profById.get(sid);
			return {
				enrollment_id: row.id as string,
				student_profile_id: sid,
				student_code: (prof?.student_id as string) ?? "",
				nickname: (prof?.nickname ?? prof?.real_name) as string | null,
				email: studEmailMap.get(sid) ?? "",
				course_id: row.course_id as string,
				course_title: courseTitle.get(row.course_id as string) ?? "—",
				payment_status: row.payment_status as string,
				refund_reason: (row.refund_reason as string | null) ?? null,
				enrolled_at: row.enrollment_date as string,
			};
		});

		return NextResponse.json({ enrollments });
	}

	const { data: profiles, error } = await supabase
		.from("profiles")
		.select("id, student_id, nickname, real_name")
		.not("student_id", "is", null)
		.order("created_at", { ascending: false });

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	const ids = (profiles ?? []).map((p) => p.id as string);
	let payByStudent = new Map<string, { payment_status: string }[]>();
	if (ids.length > 0) {
		const { data: scRows } = await supabase
			.from("student_courses")
			.select("student_id, payment_status")
			.in("student_id", ids);
		payByStudent = new Map();
		for (const row of scRows ?? []) {
			const sid = row.student_id as string;
			const list = payByStudent.get(sid) ?? [];
			list.push({ payment_status: row.payment_status as string });
			payByStudent.set(sid, list);
		}
	}

	const rosterIds = (profiles ?? []).map((p) => p.id as string);
	const rosterEmailMap = await getAuthEmailsByUserIds(supabase, rosterIds);

	const students = (profiles ?? []).map((p) => ({
		id: p.id as string,
		student_id: p.student_id as string,
		nickname: (p.nickname ?? p.real_name) as string | null,
		email: rosterEmailMap.get(p.id as string) ?? "",
		payment_status: aggregatePayment(payByStudent.get(p.id as string) ?? []),
	}));

	return NextResponse.json({ students });
}
