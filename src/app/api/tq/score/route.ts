import { NextResponse } from "next/server";

import { getAdminSession } from "@/lib/auth/admin-session";
import { requireMembershipCapability } from "@/lib/membership/guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { TQ_MIN_TRADES_FOR_SCORE } from "@/lib/tq/constants";
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
		const [{ data, error }, { data: tradeCountRows, error: tradeCountError }] = await Promise.all([
			srv
				.from("tq_scores")
				.select("dimension,score,total_score,calc_time")
				.eq("user_id", targetUserId)
				.eq("environment", env)
				.eq("period", period),
			srv
				.from("tq_features")
				.select("raw_value")
				.eq("user_id", targetUserId)
				.eq("environment", env)
				.eq("period", period)
				.eq("feature_name", "TradeCount")
				.limit(1),
		]);
		if (error || tradeCountError) {
			return NextResponse.json(
				{ success: false, error: error?.message ?? tradeCountError?.message ?? "读取TQ失败" },
				{ status: 500 },
			);
		}
		const rows = data ?? [];
		const tradeCount = Number(tradeCountRows?.[0]?.raw_value ?? 0);
		const minTrades = TQ_MIN_TRADES_FOR_SCORE[env];
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
				meta: {
					tradeCount,
					minTradesForScore: minTrades,
					eligible: tradeCount >= minTrades,
				},
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "TQ计算失败";
		return NextResponse.json({ success: false, error: message }, { status: 500 });
	}
}
