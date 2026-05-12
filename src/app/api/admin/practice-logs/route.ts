import { NextResponse } from "next/server";

import { requireSuperAdminSession } from "@/lib/auth/admin-api-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

type LogRow = {
	id: string;
	user_id: string;
	level_id: string;
	step_id: string;
	user_input: Record<string, unknown> | null;
	correct: boolean | null;
	score_delta: number | null;
	created_at: string;
};

type FilterableQuery = {
	eq: (...args: unknown[]) => FilterableQuery;
	gte: (...args: unknown[]) => FilterableQuery;
	lte: (...args: unknown[]) => FilterableQuery;
};

function toBoolFilter(value: string | null): boolean | null {
	if (value === "true") return true;
	if (value === "false") return false;
	return null;
}

function csvEscape(input: unknown): string {
	const raw = String(input ?? "");
	if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) {
		return `"${raw.replaceAll("\"", "\"\"")}"`;
	}
	return raw;
}

export async function GET(request: Request) {
	const gated = await requireSuperAdminSession();
	if (gated instanceof NextResponse) return gated;

	const service = getServiceSupabase();
	if (!service) {
		return NextResponse.json({ success: false, error: "服务不可用：缺少 service role" }, { status: 503 });
	}

	const url = new URL(request.url);
	const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
	const pageSize = Math.min(100, Math.max(20, Number(url.searchParams.get("pageSize") ?? "20")));
	const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
	const userId = (url.searchParams.get("userId") ?? "").trim();
	const levelId = (url.searchParams.get("levelId") ?? "").trim();
	const stepId = (url.searchParams.get("stepId") ?? "").trim();
	const correctFilter = toBoolFilter(url.searchParams.get("correct"));
	const start = (url.searchParams.get("start") ?? "").trim();
	const end = (url.searchParams.get("end") ?? "").trim();
	const format = (url.searchParams.get("format") ?? "").trim().toLowerCase();

	const applyBaseFilters = (q: FilterableQuery) => {
		let query = q;
		if (userId) query = query.eq("user_id", userId);
		if (levelId) query = query.eq("level_id", levelId);
		if (stepId) query = query.eq("step_id", stepId);
		if (correctFilter !== null) query = query.eq("correct", correctFilter);
		if (start) query = query.gte("created_at", `${start}T00:00:00.000Z`);
		if (end) query = query.lte("created_at", `${end}T23:59:59.999Z`);
		return query;
	};

	const attachNicknames = async (rows: LogRow[]) => {
		const userIds = [...new Set(rows.map((row) => row.user_id))];
		let nicknameMap = new Map<string, string>();
		if (userIds.length > 0) {
			const { data: profiles } = await service.from("profiles").select("id, nickname").in("id", userIds);
			nicknameMap = new Map(
				(profiles ?? []).map((profile) => [String(profile.id), String(profile.nickname ?? "").trim() || "匿名用户"]),
			);
		}
		return rows.map((row) => ({
			...row,
			nickname: nicknameMap.get(row.user_id) ?? `用户${row.user_id.slice(0, 6)}`,
		}));
	};

	const toFilteredBySearch = (rows: Awaited<ReturnType<typeof attachNicknames>>) => {
		if (!search) return rows;
		return rows.filter((row) => {
			const action = typeof row.user_input?.action === "string" ? row.user_input.action.toLowerCase() : "";
			return (
				row.nickname.toLowerCase().includes(search) ||
				row.step_id.toLowerCase().includes(search) ||
				row.level_id.toLowerCase().includes(search) ||
				action.includes(search)
			);
		});
	};

	const { data: levelRows } = await service.from("practice_logs").select("level_id").order("level_id", { ascending: true }).limit(5000);
	const levelOptions = [...new Set((levelRows ?? []).map((row) => String(row.level_id)).filter(Boolean))];

	const { data: scoreUsers } = await service.from("practice_scores").select("user_id").limit(1000);
	const userOptionsRaw = (scoreUsers ?? []).map((row) => String(row.user_id)).filter(Boolean);
	let userOptions: Array<{ userId: string; nickname: string }> = userOptionsRaw.map((id) => ({ userId: id, nickname: `用户${id.slice(0, 6)}` }));
	if (userOptionsRaw.length > 0) {
		const { data: profiles } = await service.from("profiles").select("id, nickname").in("id", userOptionsRaw);
		const map = new Map((profiles ?? []).map((profile) => [String(profile.id), String(profile.nickname ?? "").trim() || `用户${String(profile.id).slice(0, 6)}`]));
		userOptions = userOptionsRaw.map((id) => ({ userId: id, nickname: map.get(id) ?? `用户${id.slice(0, 6)}` }));
	}

	if (format === "csv" || search) {
		const { data, error } = await applyBaseFilters(
			service
				.from("practice_logs")
				.select("id,user_id,level_id,step_id,user_input,correct,score_delta,created_at")
				.order("created_at", { ascending: false })
				.limit(5000),
		);
		if (error) {
			return NextResponse.json({ success: false, error: error.message }, { status: 500 });
		}
		const withNicknames = await attachNicknames((data ?? []) as LogRow[]);
		const filtered = toFilteredBySearch(withNicknames);
		const total = filtered.length;
		const startIdx = (page - 1) * pageSize;
		const pageRows = filtered.slice(startIdx, startIdx + pageSize);

		if (format === "csv") {
			const header = ["时间", "用户昵称", "关卡ID", "步骤ID", "正确", "得分变化", "用户输入"];
			const lines = filtered.map((row) => [
				row.created_at,
				row.nickname,
				row.level_id,
				row.step_id,
				row.correct === null ? "" : row.correct ? "正确" : "错误",
				Number(row.score_delta ?? 0),
				JSON.stringify(row.user_input ?? {}),
			]);
			const csv = [header, ...lines].map((line) => line.map(csvEscape).join(",")).join("\n");
			return new NextResponse(csv, {
				status: 200,
				headers: {
					"Content-Type": "text/csv; charset=utf-8",
					"Content-Disposition": `attachment; filename="practice-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
				},
			});
		}

		return NextResponse.json({
			success: true,
			total,
			page,
			pageSize,
			rows: pageRows,
			levelOptions,
			userOptions,
		});
	}

	const from = (page - 1) * pageSize;
	const to = from + pageSize - 1;
	const { data, error, count } = await applyBaseFilters(
		service
			.from("practice_logs")
			.select("id,user_id,level_id,step_id,user_input,correct,score_delta,created_at", { count: "exact" })
			.order("created_at", { ascending: false })
			.range(from, to),
	);
	if (error) {
		return NextResponse.json({ success: false, error: error.message }, { status: 500 });
	}
	const rows = await attachNicknames((data ?? []) as LogRow[]);
	return NextResponse.json({
		success: true,
		total: Number(count ?? 0),
		page,
		pageSize,
		rows,
		levelOptions,
		userOptions,
	});
}
