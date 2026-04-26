import { NextResponse } from "next/server";

import { getAdminSession } from "@/lib/auth/admin-session";
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

/** 已审核入库的学员（profiles.student_id = BDxxxx），用于选课与收费 */
export async function GET() {
	const session = await getAdminSession();
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const { data: profiles, error } = await supabase
		.from("profiles")
		.select("id, student_id, nickname, full_name, email")
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

	const students = (profiles ?? []).map((p) => ({
		id: p.id as string,
		student_id: p.student_id as string,
		nickname: (p.nickname ?? p.full_name) as string | null,
		email: p.email as string,
		payment_status: aggregatePayment(payByStudent.get(p.id as string) ?? []),
	}));

	return NextResponse.json({ students });
}
