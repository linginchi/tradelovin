import { NextResponse } from "next/server";

import { requireSuperAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET() {
	const gated = await requireSuperAdminSession();
	if (gated instanceof NextResponse) return gated;

	const srv = getServiceSupabase();
	if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

	const { data, error } = await srv
		.from("tq_baseline_users")
		.select("user_id,added_at")
		.order("added_at", { ascending: false })
		.limit(50);
	if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

	return NextResponse.json({ success: true, users: data ?? [] });
}

