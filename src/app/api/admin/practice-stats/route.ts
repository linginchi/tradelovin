import { NextResponse } from "next/server";

import { requireSuperAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET() {
	const gated = await requireSuperAdminSession();
	if (gated instanceof NextResponse) return gated;

	const service = getServiceSupabase();
	if (!service) {
		return NextResponse.json({ success: false, error: "服务不可用：缺少 service role" }, { status: 503 });
	}

	const todayStart = new Date();
	todayStart.setHours(0, 0, 0, 0);

	const [{ count: todayCount, error: todayError }, { data: allRows, error: allError }, { data: scoreRows, error: scoreError }] =
		await Promise.all([
			service
				.from("practice_logs")
				.select("id", { count: "exact", head: true })
				.gte("created_at", todayStart.toISOString()),
			service.from("practice_logs").select("correct, level_id"),
			service.from("practice_scores").select("completed_levels"),
		]);

	if (todayError || allError || scoreError) {
		return NextResponse.json(
			{ success: false, error: todayError?.message ?? allError?.message ?? scoreError?.message ?? "读取统计失败" },
			{ status: 500 },
		);
	}

	const logs = allRows ?? [];
	const correctCount = logs.filter((row) => row.correct === true).length;
	const validStepCount = logs.filter((row) => row.correct !== null).length;
	const accuracy = validStepCount > 0 ? Math.round((correctCount / validStepCount) * 10000) / 100 : 0;

	const levelSummaryMap = new Map<string, { attempts: number; pass: number }>();
	for (const row of logs) {
		const levelId = String(row.level_id ?? "");
		if (!levelId) continue;
		const current = levelSummaryMap.get(levelId) ?? { attempts: 0, pass: 0 };
		current.attempts += 1;
		if (row.correct === true) current.pass += 1;
		levelSummaryMap.set(levelId, current);
	}

	const completionMap = new Map<string, number>();
	for (const row of scoreRows ?? []) {
		const arr = Array.isArray(row.completed_levels) ? row.completed_levels : [];
		for (const item of arr) {
			if (!item || typeof item !== "object") continue;
			const levelId = typeof (item as Record<string, unknown>).levelId === "string" ? String((item as Record<string, unknown>).levelId) : "";
			if (!levelId) continue;
			completionMap.set(levelId, (completionMap.get(levelId) ?? 0) + 1);
		}
	}

	const levelStats = [...levelSummaryMap.entries()].map(([levelId, value]) => ({
		levelId,
		attempts: value.attempts,
		passRate: value.attempts > 0 ? Math.round((value.pass / value.attempts) * 10000) / 100 : 0,
		completedUsers: completionMap.get(levelId) ?? 0,
	}));

	return NextResponse.json({
		success: true,
		todayPracticeCount: Number(todayCount ?? 0),
		accuracy,
		levelStats,
	});
}
