import { NextResponse } from "next/server";

import { CHALLENGES } from "@/lib/training/challenges";
import { requireMembershipCapability } from "@/lib/membership/guard";
import { requireTradeUser } from "@/lib/trade/require-user";
import type { LegacyTradeChallengesApiResponse, LegacyTradeChallengesItem } from "@/lib/trade-v2/api-types";

export const runtime = "nodejs";

export async function GET() {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) return auth;

	const { supabase, userId } = auth;
	const membership = await requireMembershipCapability(supabase, userId, "sim_trading");
	if (membership instanceof NextResponse) return membership;
	const { data: runs } = await supabase
		.from("sim_challenge_runs")
		.select("challenge_code,talent_score,created_at")
		.eq("user_id", userId)
		.order("created_at", { ascending: false })
		.limit(50);

	const byCode = new Map<string, { played: number; bestTalent: number }>();
	for (const row of runs ?? []) {
		const code = String((row as { challenge_code: string }).challenge_code);
		const val = Number((row as { talent_score: number }).talent_score ?? 0);
		const prev = byCode.get(code) ?? { played: 0, bestTalent: 0 };
		byCode.set(code, {
			played: prev.played + 1,
			bestTalent: Math.max(prev.bestTalent, val),
		});
	}

	const data: LegacyTradeChallengesItem[] = CHALLENGES.map((c) => ({
		...c,
		progress: byCode.get(c.code) ?? { played: 0, bestTalent: 0 },
	}));
	return NextResponse.json<LegacyTradeChallengesApiResponse>({ success: true, data });
}
