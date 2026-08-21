"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { CoachBadge } from "@/components/coach/CoachBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CoachInventoryRow, CoachStudentRow, ResourceRequestRow } from "@/lib/coach/types";

type DeskState = {
	inventory: CoachInventoryRow[];
	students: Array<CoachStudentRow & { student_name?: string; student_email?: string | null }>;
	requests: Array<ResourceRequestRow & { student_name?: string }>;
};

const EMPTY: DeskState = { inventory: [], students: [], requests: [] };

export function CoachDeskClient() {
	const [allowed, setAllowed] = useState<boolean | null>(null);
	const [deny, setDeny] = useState("");
	const [state, setState] = useState<DeskState>(EMPTY);
	const [form, setForm] = useState({ symbol: "", name: "", long_limit: "100000", short_limit: "100000" });
	const [selfId, setSelfId] = useState("");
	const [grant, setGrant] = useState({ studentId: "", symbol: "", side: "short", quantity: "100" });
	const [studentEmail, setStudentEmail] = useState("");
	const [busy, setBusy] = useState(false);

	const load = useCallback(async () => {
		const me = await fetch("/api/coach/me", { credentials: "include" });
		const meJson = (await me.json()) as {
			success?: boolean;
			data?: { canOpenDesk?: boolean; userId?: string };
			error?: string;
		};
		if (!me.ok || !meJson.data?.canOpenDesk) {
			setAllowed(false);
			setDeny(meJson.error ?? "需要金钱豹教练身份，且会员为有效 T3。");
			return;
		}
		setAllowed(true);
		if (meJson.data.userId) {
			setSelfId(meJson.data.userId);
			setGrant((prev) => ({ ...prev, studentId: prev.studentId || meJson.data?.userId || "" }));
		}
		const [invRes, stuRes, reqRes] = await Promise.all([
			fetch("/api/coach/resources", { credentials: "include" }),
			fetch("/api/coach/students", { credentials: "include" }),
			fetch("/api/coach/requests", { credentials: "include" }),
		]);
		const [invJson, stuJson, reqJson] = await Promise.all([
			invRes.json() as Promise<{ success?: boolean; data?: CoachInventoryRow[]; error?: string }>,
			stuRes.json() as Promise<{ success?: boolean; data?: DeskState["students"]; error?: string }>,
			reqRes.json() as Promise<{ success?: boolean; data?: DeskState["requests"]; error?: string }>,
		]);
		if (!invRes.ok || !invJson.success) throw new Error(invJson.error ?? "读取库存失败");
		if (!stuRes.ok || !stuJson.success) throw new Error(stuJson.error ?? "读取学员失败");
		if (!reqRes.ok || !reqJson.success) throw new Error(reqJson.error ?? "读取申请失败");
		setState({
			inventory: invJson.data ?? [],
			students: stuJson.data ?? [],
			requests: reqJson.data ?? [],
		});
	}, []);

	useEffect(() => {
		void load().catch((error: unknown) => {
			setAllowed(false);
			setDeny(error instanceof Error ? error.message : "加载失败");
		});
	}, [load]);

	async function saveInventory() {
		setBusy(true);
		try {
			const res = await fetch("/api/coach/resources", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					symbol: form.symbol,
					name: form.name || undefined,
					long_limit: Number(form.long_limit),
					short_limit: Number(form.short_limit),
				}),
			});
			const json = (await res.json()) as { success?: boolean; data?: CoachInventoryRow[]; error?: string };
			if (!res.ok || !json.success) {
				toast.error(json.error ?? "保存失败");
				return;
			}
			toast.success("库存已保存");
			setState((prev) => ({ ...prev, inventory: json.data ?? prev.inventory }));
		} finally {
			setBusy(false);
		}
	}

	async function addStudent() {
		setBusy(true);
		try {
			const res = await fetch("/api/coach/students", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ email: studentEmail }),
			});
			const json = (await res.json()) as { success?: boolean; data?: DeskState["students"]; error?: string };
			if (!res.ok || !json.success) {
				toast.error(json.error ?? "添加失败");
				return;
			}
			toast.success("学员已加入");
			setStudentEmail("");
			setState((prev) => ({ ...prev, students: json.data ?? prev.students }));
		} finally {
			setBusy(false);
		}
	}

	async function reviewBind(studentId: string, status: "accepted" | "rejected") {
		const res = await fetch("/api/coach/students", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({ studentId, status }),
		});
		const json = (await res.json()) as { success?: boolean; data?: DeskState["students"]; error?: string };
		if (!res.ok || !json.success) {
			toast.error(json.error ?? "更新失败");
			return;
		}
		setState((prev) => ({ ...prev, students: json.data ?? prev.students }));
	}

	async function reviewRequest(requestId: string, action: "approve" | "reject") {
		let rejectReason = "";
		if (action === "reject") {
			const typed = window.prompt("拒绝原因（可留空，取消则不提交）");
			if (typed === null) return;
			rejectReason = typed.trim();
		}
		const res = await fetch("/api/coach/requests", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({ requestId, action, rejectReason }),
		});
		const json = (await res.json()) as { success?: boolean; error?: string };
		if (!res.ok || !json.success) {
			toast.error(json.error ?? "处理失败");
			return;
		}
		toast.success(action === "approve" ? "已批准并到账" : "已拒绝");
		await load();
	}

	async function grantNow() {
		setBusy(true);
		try {
			const res = await fetch("/api/coach/requests", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					studentId: grant.studentId,
					symbol: grant.symbol,
					side: grant.side,
					quantity: Number(grant.quantity),
				}),
			});
			const json = (await res.json()) as { success?: boolean; error?: string };
			if (!res.ok || !json.success) {
				toast.error(json.error ?? "发放失败");
				return;
			}
			toast.success("额度已直接发放");
			await load();
		} finally {
			setBusy(false);
		}
	}

	if (allowed === null) {
		return <p className="text-muted-foreground text-sm">加载教练工作台…</p>;
	}
	if (!allowed) {
		return (
			<div className="rounded-xl border p-6">
				<h1 className="text-xl font-semibold">教练工作台</h1>
				<p className="text-muted-foreground mt-2 text-sm">{deny}</p>
			</div>
		);
	}

	const acceptedStudents = state.students.filter((row) => row.status === "accepted");
	const pendingBinds = state.students.filter((row) => row.status === "pending");
	const pendingRequests = state.requests.filter((row) => row.status === "pending");

	return (
		<div className="space-y-8">
			<header className="flex flex-wrap items-center gap-3">
				<h1 className="text-2xl font-semibold tracking-tight">教练工作台</h1>
				<CoachBadge />
			</header>
			<p className="text-muted-foreground text-sm">
				日常请在考核盘「资源」栏加库存、批准审核中申请或直接发放。本页是备份工作台。
			</p>

			<section className="space-y-3 rounded-xl border p-4">
				<h2 className="text-sm font-medium">我的可发放库存</h2>
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					<div className="space-y-1.5">
						<Label htmlFor="coach-symbol">标的</Label>
						<Input id="coach-symbol" value={form.symbol} onChange={(e) => setForm((p) => ({ ...p, symbol: e.target.value }))} placeholder="600519" />
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="coach-name">名称</Label>
						<Input id="coach-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="coach-long">可做多</Label>
						<Input id="coach-long" value={form.long_limit} onChange={(e) => setForm((p) => ({ ...p, long_limit: e.target.value }))} />
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="coach-short">可做空</Label>
						<Input id="coach-short" value={form.short_limit} onChange={(e) => setForm((p) => ({ ...p, short_limit: e.target.value }))} />
					</div>
				</div>
				<Button type="button" disabled={busy} onClick={() => void saveInventory()}>
					保存库存
				</Button>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>标的</TableHead>
							<TableHead className="text-end">可做多</TableHead>
							<TableHead className="text-end">可做空</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{state.inventory.length === 0 ? (
							<TableRow>
								<TableCell colSpan={3} className="text-muted-foreground text-center">
									还没有库存。先加入例如 600519.SH。
								</TableCell>
							</TableRow>
						) : (
							state.inventory.map((row) => (
								<TableRow key={row.id}>
									<TableCell>{row.symbol}{row.name ? ` ${row.name}` : ""}</TableCell>
									<TableCell className="text-end">{row.long_limit}</TableCell>
									<TableCell className="text-end">{row.short_limit}</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</section>

			<section className="space-y-3 rounded-xl border p-4">
				<h2 className="text-sm font-medium">我的学员</h2>
				<div className="flex flex-wrap items-end gap-2">
					<div className="min-w-56 space-y-1.5">
						<Label htmlFor="student-email">按邮箱添加</Label>
						<Input id="student-email" value={studentEmail} onChange={(e) => setStudentEmail(e.target.value)} placeholder="student@example.com" />
					</div>
					<Button type="button" variant="outline" disabled={busy || !studentEmail.trim()} onClick={() => void addStudent()}>
						加入并绑定
					</Button>
				</div>
				{pendingBinds.length > 0 ? (
					<div className="space-y-2">
						<p className="text-xs font-medium">待接受绑定</p>
						{pendingBinds.map((row) => (
							<div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
								<span>{row.student_name ?? row.student_id}</span>
								<div className="flex gap-2">
									<Button size="sm" onClick={() => void reviewBind(row.student_id, "accepted")}>
										接受
									</Button>
									<Button size="sm" variant="outline" onClick={() => void reviewBind(row.student_id, "rejected")}>
										拒绝
									</Button>
								</div>
							</div>
						))}
					</div>
				) : null}
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>学员</TableHead>
							<TableHead>邮箱</TableHead>
							<TableHead>状态</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{state.students.length === 0 ? (
							<TableRow>
								<TableCell colSpan={3} className="text-muted-foreground text-center">
									还没有学员
								</TableCell>
							</TableRow>
						) : (
							state.students.map((row) => (
								<TableRow key={row.id}>
									<TableCell>{row.student_name ?? row.student_id}</TableCell>
									<TableCell className="font-mono text-xs">{row.student_email ?? "—"}</TableCell>
									<TableCell>{row.status === "accepted" ? "已绑定" : row.status === "pending" ? "待接受" : "已拒绝"}</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</section>

			<section className="space-y-3 rounded-xl border p-4">
				<h2 className="text-sm font-medium">直接发放</h2>
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					<div className="space-y-1.5">
						<Label htmlFor="grant-student">学员</Label>
						<select
							id="grant-student"
							className="bg-background w-full rounded-md border px-3 py-2 text-sm"
							value={grant.studentId}
							onChange={(e) => setGrant((p) => ({ ...p, studentId: e.target.value }))}
						>
							<option value={selfId || ""}>自己（本账号）</option>
							{acceptedStudents.map((row) => (
								<option key={row.student_id} value={row.student_id}>
									{row.student_name ?? row.student_id}
								</option>
							))}
						</select>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="grant-symbol">标的</Label>
						<Input id="grant-symbol" value={grant.symbol} onChange={(e) => setGrant((p) => ({ ...p, symbol: e.target.value }))} placeholder="600519" />
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="grant-side">方向</Label>
						<select
							id="grant-side"
							className="bg-background w-full rounded-md border px-3 py-2 text-sm"
							value={grant.side}
							onChange={(e) => setGrant((p) => ({ ...p, side: e.target.value }))}
						>
							<option value="long">多头</option>
							<option value="short">空头</option>
						</select>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="grant-qty">数量</Label>
						<Input id="grant-qty" value={grant.quantity} onChange={(e) => setGrant((p) => ({ ...p, quantity: e.target.value }))} />
					</div>
				</div>
				<Button type="button" disabled={busy} onClick={() => void grantNow()}>
					立即发放
				</Button>
			</section>

			<section className="space-y-3 rounded-xl border p-4">
				<h2 className="text-sm font-medium">审核中申请（{pendingRequests.length}）</h2>
				{pendingRequests.length === 0 ? (
					<p className="text-muted-foreground text-sm">没有审核中的申请。</p>
				) : (
					pendingRequests.map((row) => (
						<div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
							<span>
								{row.student_name ?? row.student_id} · {row.symbol} · {row.side === "short" ? "空头" : "多头"} × {row.quantity}
							</span>
							<div className="flex gap-2">
								<Button size="sm" onClick={() => void reviewRequest(row.id, "approve")}>
									批准
								</Button>
								<Button size="sm" variant="outline" onClick={() => void reviewRequest(row.id, "reject")}>
									拒绝
								</Button>
							</div>
						</div>
					))
				)}
			</section>
		</div>
	);
}
