import { NextResponse } from "next/server";

import { assignMissingPlatformStudentIds } from "@/lib/admin/student-code";
import { requireAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST() {
	const gated = await requireAdminSession();
	if (gated instanceof NextResponse) return gated;
	const srv = getServiceSupabase();
	if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

	const { data, error } = await srv.from("user_memberships").select("user_id").limit(500);
	if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

	try {
		const result = await assignMissingPlatformStudentIds(
			srv,
			(data ?? []).map((row) => row.user_id as string),
		);
		return NextResponse.json({ success: true, data: result });
	} catch (err) {
		return NextResponse.json(
			{ success: false, error: err instanceof Error ? err.message : "补发学号失败" },
			{ status: 400 },
		);
	}
}
