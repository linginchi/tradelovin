import { NextResponse } from "next/server";

import { getAdminSession } from "@/lib/auth/admin-session";
import { requireMembershipCapability } from "@/lib/membership/guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { ensureTqCalculated } from "@/lib/tq/engine";
import { readTqEnv, readTqPeriod } from "@/lib/tq/request";
import { buildTqRadarContract } from "@/lib/tq/radar-contract";
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
	if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

	try {
		await ensureTqCalculated(srv, { userId: targetUserId, environment: env, period });
		const [{ data: scoreRows, error: scoreErr }, { data: featureRows, error: featureErr }] = await Promise.all([
			srv
				.from("tq_scores")
				.select("dimension,score,total_score,calc_time")
				.eq("user_id", targetUserId)
				.eq("environment", env)
				.eq("period", period),
			srv
				.from("tq_features")
				.select("feature_name,raw_value,norm_score,calc_time")
				.eq("user_id", targetUserId)
				.eq("environment", env)
				.eq("period", period),
		]);
		if (scoreErr || featureErr) {
			return NextResponse.json(
				{ success: false, error: scoreErr?.message ?? featureErr?.message ?? "读取雷达数据失败" },
				{ status: 500 },
			);
		}
		const dimensions = {
			profitability: 0,
			riskControl: 0,
			consistency: 0,
			activeness: 0,
		};
		let totalScore = 0;
		let calcTime = "";
		for (const row of scoreRows ?? []) {
			if (row.dimension === "profitability") dimensions.profitability = Number(row.score ?? 0);
			if (row.dimension === "risk_control") dimensions.riskControl = Number(row.score ?? 0);
			if (row.dimension === "consistency") dimensions.consistency = Number(row.score ?? 0);
			if (row.dimension === "activeness") dimensions.activeness = Number(row.score ?? 0);
			totalScore = Number(row.total_score ?? totalScore);
			calcTime = String(row.calc_time ?? calcTime);
		}
		const features = (featureRows ?? []).map((item) => ({
			featureName: String(item.feature_name),
			rawValue: Number(item.raw_value ?? 0),
			normScore: Number(item.norm_score ?? 0),
			calcTime: String(item.calc_time ?? ""),
		}));
		const radar = buildTqRadarContract(
			{
				userId: targetUserId,
				environment: env,
				period,
				totalScore,
				dimensions,
				calcTime,
			},
			features,
		);
		return NextResponse.json({
			success: true,
			data: {
				userId: targetUserId,
				environment: env,
				period,
				totalScore,
				calcTime,
				radar,
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "读取雷达失败";
		return NextResponse.json({ success: false, error: message }, { status: 500 });
	}
}

