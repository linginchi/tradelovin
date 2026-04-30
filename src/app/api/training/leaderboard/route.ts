import { NextResponse } from "next/server";

import { requireMembershipCapability } from "@/lib/membership/guard";
import { requireTradeUser } from "@/lib/trade/require-user";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET() {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) return auth;
	const { supabase, userId } = auth;
	const membership = await requireMembershipCapability(supabase, userId, "sim_trading");
	if (membership instanceof NextResponse) return membership;
	const srv = getServiceSupabase() ?? supabase;

	const { data: rows } = await srv
		.from("sim_challenge_runs")
		.select("user_id,talent_score,challenge_name,created_at")
		.order("talent_score", { ascending: false })
		.limit(20);

	const data = (rows ?? []).map((row, idx) => {
		const r = row as {
			user_id: string;
			talent_score: number;
			challenge_name: string;
			created_at: string;
		};
		return {
			rank: idx + 1,
			userTag: r.user_id === userId ? "你" : `学员#${r.user_id.slice(0, 6)}`,
			talentScore: Number(r.talent_score ?? 0),
			challengeName: r.challenge_name,
			createdAt: r.created_at,
		};
	});

	return NextResponse.json({ success: true, data });
}
