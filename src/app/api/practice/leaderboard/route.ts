import { NextResponse } from "next/server";

import { getStageByKey } from "@/lib/practice/stage";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function GET() {
	const auth = await requireTradeUser();
	if (auth instanceof NextResponse) return auth;

	const service = getServiceSupabase();
	if (!service) {
		return NextResponse.json({ success: false, error: "服务不可用：缺少 service role" }, { status: 503 });
	}

	const { data: rows, error } = await service
		.from("practice_scores")
		.select("user_id, total_score, current_stage")
		.order("total_score", { ascending: false })
		.limit(20);
	if (error) {
		return NextResponse.json({ success: false, error: error.message }, { status: 500 });
	}
	const userIds = (rows ?? []).map((row) => row.user_id);
	let profileMap = new Map<string, string>();
	if (userIds.length > 0) {
		const { data: profiles } = await service.from("profiles").select("id, nickname").in("id", userIds);
		profileMap = new Map(
			(profiles ?? []).map((profile) => [String(profile.id), String(profile.nickname ?? "").trim() || "匿名用户"]),
		);
	}

	const entries = (rows ?? []).map((row, index) => {
		const userId = String(row.user_id);
		const stage = getStageByKey(typeof row.current_stage === "string" ? row.current_stage : null);
		return {
			rank: index + 1,
			userId,
			name: profileMap.get(userId) ?? `用户${userId.slice(0, 6)}`,
			totalScore: Number(row.total_score ?? 0),
			stage,
		};
	});

	return NextResponse.json({ success: true, entries });
}
