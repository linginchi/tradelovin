import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getAuthEmailsByUserIds } from "@/lib/auth/profile-resolve";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET() {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) {
		return gated;
	}

	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
	}

	const { data: rows, error } = await srv
		.from("job_applications")
		.select("*")
		.order("created_at", { ascending: false });

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	const userIds = [...new Set((rows ?? []).map((r) => r.user_id as string))];
	let profiles: { id: string; email: string | null; nickname: string | null }[] = [];
	if (userIds.length > 0) {
		const { data: p } = await srv.from("profiles").select("id,nickname").in("id", userIds);
		const emailMap = await getAuthEmailsByUserIds(srv, userIds);
		profiles = (p ?? []).map((row) => ({
			id: row.id as string,
			nickname: row.nickname as string | null,
			email: emailMap.get(row.id as string) ?? null,
		}));
	}
	const profById = new Map(profiles.map((p) => [p.id, p]));

	const applications = (rows ?? []).map((r) => ({
		...r,
		profile: profById.get(r.user_id as string) ?? null,
	}));

	return NextResponse.json({ applications });
}
