import { NextResponse } from "next/server";

import { requireSuperAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { recalculateTqAllUsers } from "@/lib/tq/engine";
import type { TqEnvironment, TqPeriod } from "@/lib/tq/constants";

export const runtime = "nodejs";

type Body = {
	environment?: TqEnvironment;
	period?: TqPeriod;
};

export async function POST(request: Request) {
	const gated = await requireSuperAdminSession();
	if (gated instanceof NextResponse) return gated;

	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	}

	let body: Body = {};
	try {
		body = (await request.json()) as Body;
	} catch {
		// ignore invalid JSON and fallback defaults
	}
	const environment: TqEnvironment = body.environment === "live" ? "live" : "sim";
	const period: TqPeriod =
		body.period === "daily" || body.period === "weekly" || body.period === "monthly"
			? body.period
			: "all";

	try {
		const result = await recalculateTqAllUsers(srv, { environment, period });
		return NextResponse.json({
			success: true,
			message: `重算完成：${result.users.length} 位用户`,
			data: {
				environment,
				period,
				userCount: result.users.length,
				baselineCount: result.baselineUserIds.length,
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "重算失败";
		return NextResponse.json({ success: false, error: message }, { status: 500 });
	}
}
