import { NextResponse } from "next/server";

import { getAdminSession } from "@/lib/auth/admin-session";
import { requireMembershipCapability } from "@/lib/membership/guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { ensureTqCalculated } from "@/lib/tq/engine";
import { readTqEnv, readTqPeriod } from "@/lib/tq/request";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function GET(request: Request) {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) return auth;

	const url = new URL(request.url);
	const env = readTqEnv(url.searchParams.get("env"));
	const period = readTqPeriod(url.searchParams.get("period"));
	const requestedUserId = url.searchParams.get("userId");
	let targetUserId = auth.userId;

	if (requestedUserId && requestedUserId !== auth.userId) {
		const admin = await getAdminSession();
		if (!admin || (admin.role !== "admin" && admin.role !== "super_admin")) {
			return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
		}
		targetUserId = requestedUserId;
	}
	if (targetUserId === auth.userId) {
		const membership = await requireMembershipCapability(auth.supabase, auth.userId, "tq_report");
		if (membership instanceof NextResponse) return membership;
	}

	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	}

	try {
		await ensureTqCalculated(srv, { userId: targetUserId, environment: env, period });
		const { data, error } = await srv
			.from("tq_features")
			.select("feature_name,raw_value,norm_score,calc_time")
			.eq("user_id", targetUserId)
			.eq("environment", env)
			.eq("period", period)
			.order("feature_name", { ascending: true });
		if (error) {
			return NextResponse.json({ success: false, error: error.message }, { status: 500 });
		}
		return NextResponse.json({
			success: true,
			data: (data ?? []).map((row) => ({
				featureName: row.feature_name,
				rawValue: Number(row.raw_value ?? 0),
				normScore: Number(row.norm_score ?? 0),
				calcTime: row.calc_time,
			})),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "TQ计算失败";
		return NextResponse.json({ success: false, error: message }, { status: 500 });
	}
}
