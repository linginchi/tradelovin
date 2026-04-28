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

	const { data: application, error: appErr } = await srv
		.from("job_applications")
		.select("*")
		.eq("user_id", user.id)
		.maybeSingle();

	if (appErr) {
		return NextResponse.json({ success: false, error: appErr.message }, { status: 500 });
	}

	if (!application) {
		return NextResponse.json({ success: true, application: null, progress: [] });
	}

	const appId = application.id as string;
	const { data: progress, error: progErr } = await srv
		.from("job_progress")
		.select("*")
		.eq("application_id", appId)
		.order("created_at", { ascending: true });

	if (progErr) {
		return NextResponse.json({ success: false, error: progErr.message }, { status: 500 });
	}

	return NextResponse.json({
		success: true,
		application,
		progress: progress ?? [],
	});
}
