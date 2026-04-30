import { NextResponse } from "next/server";

import { getAdminSession } from "@/lib/auth/admin-session";
import { requireMembershipCapability } from "@/lib/membership/guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { ensureTqCalculated } from "@/lib/tq/engine";
import { type TqEnvironment, type TqPeriod } from "@/lib/tq/constants";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

function readEnv(v: string | null): TqEnvironment {
	return v === "live" ? "live" : "sim";
}

function readPeriod(v: string | null): TqPeriod {
	return v === "daily" || v === "weekly" || v === "monthly" ? v : "all";
}

export async function GET(request: Request) {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) return auth;

	const url = new URL(request.url);
	const env = readEnv(url.searchParams.get("env"));
	const period = readPeriod(url.searchParams.get("period"));
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
			.from("tq_scores")
			.select("dimension,score,total_score,calc_time")
			.eq("user_id", targetUserId)
			.eq("environment", env)
			.eq("period", period);
		if (error) {
			return NextResponse.json({ success: false, error: error.message }, { status: 500 });
		}
		const rows = data ?? [];
		const dim = {
			profitability: 0,
			riskControl: 0,
			consistency: 0,
			activeness: 0,
		};
		let totalScore = 0;
		let calcTime = "";
		for (const row of rows) {
			if (row.dimension === "profitability") dim.profitability = Number(row.score ?? 0);
			if (row.dimension === "risk_control") dim.riskControl = Number(row.score ?? 0);
			if (row.dimension === "consistency") dim.consistency = Number(row.score ?? 0);
			if (row.dimension === "activeness") dim.activeness = Number(row.score ?? 0);
			totalScore = Number(row.total_score ?? totalScore);
			calcTime = String(row.calc_time ?? calcTime);
		}
		return NextResponse.json({
			success: true,
			data: {
				userId: targetUserId,
				environment: env,
				period,
				totalScore,
				dimensions: dim,
				calcTime,
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "TQ计算失败";
		return NextResponse.json({ success: false, error: message }, { status: 500 });
	}
}
