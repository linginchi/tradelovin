import { NextResponse } from "next/server";

import { getServiceSupabase } from "@/lib/supabase/service";
import { runMarketingGrowthCatchUp } from "@/lib/video/marketing-growth-service";

export const runtime = "nodejs";

function unauthorized() {
	return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
	const expected = process.env.VIDEO_MARKETING_GROWTH_CRON_KEY;
	if (!expected) {
		return NextResponse.json(
			{ success: false, error: "VIDEO_MARKETING_GROWTH_CRON_KEY 未配置" },
			{ status: 503 },
		);
	}

	const provided = request.headers.get("x-video-marketing-growth-cron-key") ?? "";
	if (!provided || provided !== expected) {
		return unauthorized();
	}

	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	}

	try {
		const summary = await runMarketingGrowthCatchUp(srv, new Date());
		return NextResponse.json({
			success: true,
			message: "marketing popularity growth applied",
			data: summary,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "人气成长排程失败";
		return NextResponse.json({ success: false, error: message }, { status: 500 });
	}
}
