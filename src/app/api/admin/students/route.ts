import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getAuthEmailsByUserIds, getAuthUserIdByEmail } from "@/lib/auth/profile-resolve";
import { getServiceSupabase } from "@/lib/supabase/service";

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
	const db = supabase;

	const { searchParams } = new URL(req.url);
	const search = (searchParams.get("search") ?? "").trim().replace(/%/g, "").slice(0, 120);
	const status = (searchParams.get("status") ?? "").trim();
	const reviewScope = (searchParams.get("review_scope") ?? "").trim();

	let registrations: RegRow[] = [];

	if (search) {
		const p = `%${search}%`;

		let q1 = db.from("registrations").select("*");
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

		const { data: sidProfs } = await db.from("profiles").select("id").ilike("student_id", p);
		const sidUids = (sidProfs ?? []).map((r) => r.id as string);
		const sidEmailMap = await getAuthEmailsByUserIds(db, sidUids);
		const extraEmails = [...new Set(Array.from(sidEmailMap.values()).map((e) => normEmail(e)).filter(Boolean))];

		let reg2: RegRow[] = [];
		if (extraEmails.length > 0) {
			let q2 = db.from("registrations").select("*").in("email", extraEmails);
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
		const { data, error } = await baseRegistrationsQuery(db, status, reviewScope);
		if (error) {
			return NextResponse.json({ error: error.message }, { status: 500 });
		}
		registrations = (data ?? []) as RegRow[];
	}

	const emailToUidCache = new Map<string, string | null>();
	async function regUserId(reg: RegRow): Promise<string | null> {
		const raw = reg.user_id as string | null | undefined;
		if (raw && typeof raw === "string") return raw;
		const em = normEmail(reg.email as string);
		if (!em) return null;
		if (emailToUidCache.has(em)) return emailToUidCache.get(em) ?? null;
		const uid = await getAuthUserIdByEmail(db, em);
		emailToUidCache.set(em, uid);
		return uid;
	}

	const regUserIds = await Promise.all(registrations.map((r) => regUserId(r)));
	const uids = [...new Set(regUserIds.filter((x): x is string => Boolean(x)))];

	const profById = new Map<string, RegRow>();
	if (uids.length > 0) {
		const { data: profs } = await db
			.from("profiles")
			.select("id,real_name,nickname,avatar_url,student_id,emergency_phone,phone")
			.in("id", uids);

		for (const p of profs ?? []) {
			profById.set(p.id as string, p as RegRow);
		}
	}

	const students = registrations.map((reg, i) => {
		const uid = regUserIds[i];
		const prof = uid ? profById.get(uid) : undefined;
		return {
			...reg,
			avatar_url: (prof?.avatar_url as string | null) ?? null,
			emergency_phone: (prof?.emergency_phone as string | null) ?? null,
			profile_id: (prof?.id as string | undefined) ?? uid ?? null,
			student_id: (reg.student_id as string | null) ?? (prof?.student_id as string | null) ?? null,
		};
	});

	return NextResponse.json({ students });
}
