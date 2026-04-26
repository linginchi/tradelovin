import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "edge";

type RegRow = Record<string, unknown>;

function normEmail(e: string | null | undefined): string {
	return String(e ?? "")
		.trim()
		.toLowerCase();
}

/** 无搜索条件时的列表查询 */
function baseRegistrationsQuery(
	supabase: NonNullable<ReturnType<typeof getServiceSupabase>>,
	status: string,
	reviewScope: string,
) {
	let q = supabase.from("registrations").select("*");
	if (reviewScope === "reviewed") {
		return q
			.in("status", ["approved", "rejected"])
			.order("reviewed_at", { ascending: false, nullsFirst: false });
	}
	if (reviewScope === "pending") {
		return q.eq("status", "pending").order("created_at", { ascending: false });
	}
	if (status) {
		q = q.eq("status", status);
	}
	return q.order("created_at", { ascending: false });
}

export async function GET(req: Request) {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;

	const supabase = getServiceSupabase();
	if (!supabase) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const { searchParams } = new URL(req.url);
	const search = (searchParams.get("search") ?? "").trim().replace(/%/g, "").slice(0, 120);
	const status = (searchParams.get("status") ?? "").trim();
	const reviewScope = (searchParams.get("review_scope") ?? "").trim();

	let registrations: RegRow[] = [];

	if (search) {
		const p = `%${search}%`;

		let q1 = supabase.from("registrations").select("*");
		if (reviewScope === "reviewed") {
			q1 = q1
				.in("status", ["approved", "rejected"])
				.order("reviewed_at", { ascending: false, nullsFirst: false });
		} else if (reviewScope === "pending") {
			q1 = q1.eq("status", "pending").order("created_at", { ascending: false });
		} else {
			if (status) q1 = q1.eq("status", status);
			q1 = q1.order("created_at", { ascending: false });
		}
		q1 = q1.or(`nickname.ilike.${p},real_name.ilike.${p},email.ilike.${p},student_id.ilike.${p}`);

		const { data: reg1, error: e1 } = await q1;
		if (e1) {
			return NextResponse.json({ error: e1.message }, { status: 500 });
		}

		const { data: sidProfs } = await supabase.from("profiles").select("email").ilike("student_id", p);
		const extraEmails = [...new Set((sidProfs ?? []).map((r) => normEmail(r.email as string)).filter(Boolean))];

		let reg2: RegRow[] = [];
		if (extraEmails.length > 0) {
			let q2 = supabase.from("registrations").select("*").in("email", extraEmails);
			if (reviewScope === "reviewed") {
				q2 = q2
					.in("status", ["approved", "rejected"])
					.order("reviewed_at", { ascending: false, nullsFirst: false });
			} else if (reviewScope === "pending") {
				q2 = q2.eq("status", "pending").order("created_at", { ascending: false });
			} else {
				if (status) q2 = q2.eq("status", status);
				q2 = q2.order("created_at", { ascending: false });
			}
			const { data: r2, error: e2 } = await q2;
			if (e2) {
				return NextResponse.json({ error: e2.message }, { status: 500 });
			}
			reg2 = (r2 ?? []) as RegRow[];
		}

		const byId = new Map<string, RegRow>();
		for (const r of [...(reg1 ?? []), ...reg2]) {
			byId.set(r.id as string, r as RegRow);
		}
		registrations = Array.from(byId.values());
		registrations.sort((a, b) => {
			const ta = new Date(String(a.created_at ?? 0)).getTime();
			const tb = new Date(String(b.created_at ?? 0)).getTime();
			return tb - ta;
		});
	} else {
		const { data, error } = await baseRegistrationsQuery(supabase, status, reviewScope);
		if (error) {
			return NextResponse.json({ error: error.message }, { status: 500 });
		}
		registrations = (data ?? []) as RegRow[];
	}

	const emails = [...new Set(registrations.map((r) => normEmail(r.email as string)).filter(Boolean))];

	const profByEmail = new Map<string, RegRow>();
	if (emails.length > 0) {
		const { data: profs } = await supabase
			.from("profiles")
			.select("id,email,full_name,nickname,avatar_url,student_id,emergency_phone,phone")
			.in("email", emails);

		for (const p of profs ?? []) {
			const k = normEmail(p.email as string);
			if (k) profByEmail.set(k, p as RegRow);
		}
	}

	const students = registrations.map((reg) => {
		const em = normEmail(reg.email as string);
		const prof = em ? profByEmail.get(em) : undefined;
		return {
			...reg,
			avatar_url: (prof?.avatar_url as string | null) ?? null,
			emergency_phone: (prof?.emergency_phone as string | null) ?? null,
			profile_id: (prof?.id as string | undefined) ?? null,
			student_id: (reg.student_id as string | null) ?? (prof?.student_id as string | null) ?? null,
		};
	});

	return NextResponse.json({ students });
}
