import { NextResponse } from "next/server";

import { CHALLENGES } from "@/lib/training/challenges";
import { requireMembershipCapability } from "@/lib/membership/guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { ensureTqCalculated } from "@/lib/tq/engine";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

type Body = {
	challengeCode?: string;
};

export async function POST(request: Request) {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) return auth;
	const { supabase, userId } = auth;
	const membership = await requireMembershipCapability(supabase, userId, "sim_trading");
	if (membership instanceof NextResponse) return membership;

	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return NextResponse.json({ success: false, error: "请求体不是合法 JSON" }, { status: 400 });
	}
	const challengeCode = String(body.challengeCode ?? "");
	const challenge = CHALLENGES.find((c) => c.code === challengeCode);
	if (!challenge) return NextResponse.json({ success: false, error: "挑战不存在" }, { status: 400 });

	const srv = getServiceSupabase();
	if (!srv) {
		return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
	}
	await ensureTqCalculated(srv, { userId, environment: "sim", period: "all" });
	const { data: tqRows, error: tqErr } = await srv
		.from("tq_scores")
		.select("dimension,score,total_score")
		.eq("user_id", userId)
		.eq("environment", "sim")
		.eq("period", "all");
	if (tqErr) {
		return NextResponse.json({ success: false, error: tqErr.message }, { status: 500 });
	}
	let profitability = 0;
	let totalScore = 0;
	for (const row of tqRows ?? []) {
		if (row.dimension === "profitability") profitability = Number(row.score ?? 0);
		totalScore = Number(row.total_score ?? totalScore);
	}

	const { error } = await supabase.from("sim_challenge_runs").insert({
		user_id: userId,
		challenge_code: challenge.code,
		challenge_name: challenge.name,
		score: profitability,
		pnl_pct: 0,
		max_drawdown_pct: 0,
		talent_score: totalScore,
		metadata: {
			migration: "tradequotient",
			totalScore,
		},
	});
	if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
	return NextResponse.json({ success: true, data: { totalScore, profitability } });
}
