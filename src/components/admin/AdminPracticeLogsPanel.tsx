"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

type UserOption = { userId: string; nickname: string };
type LogRow = {
	id: string;
	user_id: string;
	nickname: string;
	level_id: string;
	step_id: string;
	user_input: Record<string, unknown> | null;
	correct: boolean | null;
	score_delta: number | null;
	created_at: string;
};

type StatsResponse = {
	todayPracticeCount: number;
	accuracy: number;
	levelStats: Array<{ levelId: string; attempts: number; passRate: number; completedUsers: number }>;
};

export function AdminPracticeLogsPanel() {
	const [rows, setRows] = useState<LogRow[]>([]);
	const [userOptions, setUserOptions] = useState<UserOption[]>([]);
	const [levelOptions, setLevelOptions] = useState<string[]>([]);
	const [stats, setStats] = useState<StatsResponse | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [total, setTotal] = useState(0);

	const [search, setSearch] = useState("");
	const [userId, setUserId] = useState("");
	const [levelId, setLevelId] = useState("");
	const [stepId, setStepId] = useState("");
	const [correct, setCorrect] = useState<"all" | "true" | "false">("all");
	const [start, setStart] = useState("");
	const [end, setEnd] = useState("");
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);

	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	const queryString = useMemo(() => {
		const params = new URLSearchParams();
		params.set("page", String(page));
		params.set("pageSize", String(pageSize));
		if (search.trim()) params.set("search", search.trim());
		if (userId) params.set("userId", userId);
		if (levelId) params.set("levelId", levelId);
		if (stepId) params.set("stepId", stepId);
		if (correct !== "all") params.set("correct", correct);
		if (start) params.set("start", start);
		if (end) params.set("end", end);
		return params.toString();
	}, [correct, end, levelId, page, pageSize, search, start, stepId, userId]);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [logsRes, statsRes] = await Promise.all([
				fetch(`/api/admin/practice-logs?${queryString}`, { credentials: "include" }),
				fetch("/api/admin/practice-stats", { credentials: "include" }),
			]);
			const logsJson = (await logsRes.json()) as {
				success?: boolean;
				error?: string;
				total?: number;
				rows?: LogRow[];
				userOptions?: UserOption[];
				levelOptions?: string[];
			};
			const statsJson = (await statsRes.json()) as {
				success?: boolean;
				error?: string;
				todayPracticeCount?: number;
				accuracy?: number;
				levelStats?: StatsResponse["levelStats"];
			};
			if (!logsRes.ok || !logsJson.success) {
				setError(logsJson.error ?? "日志加载失败");
				return;
			}
			setRows(logsJson.rows ?? []);
			setTotal(Number(logsJson.total ?? 0));
			setUserOptions(logsJson.userOptions ?? []);
			setLevelOptions(logsJson.levelOptions ?? []);

			if (statsRes.ok && statsJson.success) {
				setStats({
					todayPracticeCount: Number(statsJson.todayPracticeCount ?? 0),
					accuracy: Number(statsJson.accuracy ?? 0),
					levelStats: statsJson.levelStats ?? [],
				});
			}
		} catch {
			setError("日志加载失败");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		const timer = window.setTimeout(() => {
			void load();
		}, 0);
		return () => window.clearTimeout(timer);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [queryString]);

	const exportCsv = async () => {
		const params = new URLSearchParams(queryString);
		params.set("format", "csv");
		const res = await fetch(`/api/admin/practice-logs?${params.toString()}`, { credentials: "include" });
		if (!res.ok) {
			setError("导出失败");
			return;
		}
		const blob = await res.blob();
		const href = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = href;
		anchor.download = `practice-logs-${new Date().toISOString().slice(0, 10)}.csv`;
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(href);
	};

	return (
		<div className="space-y-6">
			<section className="grid gap-3 sm:grid-cols-3">
				<div className="rounded-lg border border-border/70 bg-card/35 p-3">
					<p className="text-xs text-muted-foreground">今日练习总次数</p>
					<p className="text-2xl font-semibold">{stats?.todayPracticeCount ?? 0}</p>
				</div>
				<div className="rounded-lg border border-border/70 bg-card/35 p-3">
					<p className="text-xs text-muted-foreground">平均正确率</p>
					<p className="text-2xl font-semibold">{stats?.accuracy ?? 0}%</p>
				</div>
				<div className="rounded-lg border border-border/70 bg-card/35 p-3">
					<p className="text-xs text-muted-foreground">关卡统计条目</p>
					<p className="text-2xl font-semibold">{stats?.levelStats.length ?? 0}</p>
				</div>
			</section>

			<section className="rounded-xl border border-border/70 bg-card/35 p-4">
				<div className="grid gap-2 md:grid-cols-3 lg:grid-cols-4">
					<input
						className="rounded-md border border-border bg-background px-3 py-2 text-sm"
						placeholder="搜索用户昵称/步骤/关卡"
						value={search}
						onChange={(e) => {
							setPage(1);
							setSearch(e.target.value);
						}}
					/>
					<select
						className="rounded-md border border-border bg-background px-3 py-2 text-sm"
						value={userId}
						onChange={(e) => {
							setPage(1);
							setUserId(e.target.value);
						}}
					>
						<option value="">全部用户</option>
						{userOptions.map((user) => (
							<option key={user.userId} value={user.userId}>
								{user.nickname}
							</option>
						))}
					</select>
					<select
						className="rounded-md border border-border bg-background px-3 py-2 text-sm"
						value={levelId}
						onChange={(e) => {
							setPage(1);
							setLevelId(e.target.value);
						}}
					>
						<option value="">全部关卡</option>
						{levelOptions.map((level) => (
							<option key={level} value={level}>
								{level}
							</option>
						))}
					</select>
					<input
						className="rounded-md border border-border bg-background px-3 py-2 text-sm"
						placeholder="步骤 ID"
						value={stepId}
						onChange={(e) => {
							setPage(1);
							setStepId(e.target.value);
						}}
					/>
					<select
						className="rounded-md border border-border bg-background px-3 py-2 text-sm"
						value={correct}
						onChange={(e) => {
							setPage(1);
							setCorrect(e.target.value as "all" | "true" | "false");
						}}
					>
						<option value="all">全部结果</option>
						<option value="true">正确</option>
						<option value="false">错误</option>
					</select>
					<input
						type="date"
						className="rounded-md border border-border bg-background px-3 py-2 text-sm"
						value={start}
						onChange={(e) => {
							setPage(1);
							setStart(e.target.value);
						}}
					/>
					<input
						type="date"
						className="rounded-md border border-border bg-background px-3 py-2 text-sm"
						value={end}
						onChange={(e) => {
							setPage(1);
							setEnd(e.target.value);
						}}
					/>
					<select
						className="rounded-md border border-border bg-background px-3 py-2 text-sm"
						value={String(pageSize)}
						onChange={(e) => {
							setPage(1);
							setPageSize(Number(e.target.value));
						}}
					>
						<option value="20">20 / 页</option>
						<option value="50">50 / 页</option>
						<option value="100">100 / 页</option>
					</select>
				</div>

				<div className="mt-3 flex flex-wrap items-center justify-between gap-2">
					<div className="flex gap-2">
						<Button variant="outline" onClick={() => void load()}>
							刷新
						</Button>
						<Button variant="outline" onClick={() => void exportCsv()}>
							导出 CSV
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
						共 {total} 条，当前第 {page}/{totalPages} 页
					</p>
				</div>

				<div className="mt-4 overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead>
							<tr className="border-b border-border/60">
								<th className="py-2">时间</th>
								<th className="py-2">用户</th>
								<th className="py-2">关卡</th>
								<th className="py-2">步骤</th>
								<th className="py-2">输入摘要</th>
								<th className="py-2">结果</th>
								<th className="py-2">分值</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => (
								<tr key={row.id} className="border-b border-border/40">
									<td className="py-2">{new Date(row.created_at).toLocaleString()}</td>
									<td className="py-2">{row.nickname}</td>
									<td className="py-2">{row.level_id}</td>
									<td className="py-2">{row.step_id}</td>
									<td className="max-w-xs truncate py-2 text-xs text-muted-foreground">
										{JSON.stringify(row.user_input ?? {}).slice(0, 60)}
									</td>
									<td className="py-2">
										{row.correct === null ? "—" : row.correct ? "正确" : "错误"}
									</td>
									<td className="py-2">{Number(row.score_delta ?? 0)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<div className="mt-3 flex items-center justify-end gap-2">
					<Button
						variant="outline"
						size="sm"
						disabled={page <= 1}
						onClick={() => setPage((prev) => Math.max(1, prev - 1))}
					>
						上一页
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={page >= totalPages}
						onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
					>
						下一页
					</Button>
				</div>
				{loading ? <p className="mt-2 text-sm text-muted-foreground">加载中...</p> : null}
				{error ? <p className="mt-2 text-sm text-amber-300">{error}</p> : null}
			</section>
		</div>
	);
}
