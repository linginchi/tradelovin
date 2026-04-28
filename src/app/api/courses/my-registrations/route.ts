import { NextResponse } from "next/server";

import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function GET() {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) {
		return auth;
	}

	const {
		data: { user },
	} = await auth.supabase.auth.getUser();
	if (!user) {
		return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
	}

	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	}

	const { data, error } = await srv
		.from("course_registrations")
		.select(
			`
      id,
      status,
      applied_at,
      notes,
      courses ( id, title, mode, start_date, end_date, location ),
      course_scores ( id, score, grade, certificate_url, uploaded_at, comment )
    `,
		)
		.eq("user_id", user.id)
		.order("applied_at", { ascending: false });

	if (error) {
		return NextResponse.json({ success: false, error: error.message }, { status: 500 });
	}

	return NextResponse.json({ success: true, registrations: data ?? [] });
}
