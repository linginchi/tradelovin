"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CoachExamDeskPayload } from "@/lib/coach/types";

type Props = {
	desk: CoachExamDeskPayload;
	busy?: boolean;
	onChanged: () => Promise<void>;
};

export function CoachExamResourcePanel({ desk, busy: parentBusy, onChanged }: Props) {
	const [form, setForm] = useState({ symbol: "", name: "", long_limit: "100000", short_limit: "100000" });
	const [grant, setGrant] = useState({ studentId: "", symbol: "", side: "short", quantity: "100" });
	const [busy, setBusy] = useState(false);
	const disabled = busy || Boolean(parentBusy);
	const acceptedStudents = desk.students.filter((row) => row.status === "accepted");
	const pendingBinds = desk.students.filter((row) => row.status === "pending");

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
			const json = (await res.json()) as { success?: boolean; error?: string };
			if (!res.ok || !json.success) {
				toast.error(json.error ?? "保存失败");
				return;
			}
			toast.success("可发放库存已保存");
			await onChanged();
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
		const json = (await res.json()) as { success?: boolean; error?: string };
		if (!res.ok || !json.success) {
			toast.error(json.error ?? "更新失败");
			return;
		}
		toast.success(status === "accepted" ? "已接受绑定" : "已拒绝绑定");
		await onChanged();
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
		await onChanged();
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
			await onChanged();
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="space-y-3 rounded-md border border-amber-300/60 bg-amber-50/40 p-3 dark:bg-amber-950/20">
			<p className="text-sm font-medium">教练当场操作</p>
			<p className="text-muted-foreground text-xs">
				日常加库存、批准审核中申请、直接发放都在本栏完成，不必进后台。批准时若库存不够，会按申请数量先补再发放。
			</p>

			{pendingBinds.length > 0 ? (
				<div className="space-y-2">
					<p className="text-xs font-medium">待接受绑定</p>
					{pendingBinds.map((row) => (
						<div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
							<span>{row.student_name ?? row.student_id}</span>
							<div className="flex gap-2">
								<Button size="sm" disabled={disabled} onClick={() => void reviewBind(row.student_id, "accepted")}>
									接受
								</Button>
								<Button size="sm" variant="outline" disabled={disabled} onClick={() => void reviewBind(row.student_id, "rejected")}>
									拒绝
								</Button>
							</div>
						</div>
					))}
				</div>
			) : null}

			<div className="space-y-2">
				<p className="text-xs font-medium">可发放库存</p>
				<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
					<div className="space-y-1">
						<Label htmlFor="exam-coach-symbol">标的</Label>
						<Input
							id="exam-coach-symbol"
							value={form.symbol}
							onChange={(e) => setForm((prev) => ({ ...prev, symbol: e.target.value }))}
							placeholder="600519"
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="exam-coach-name">名称</Label>
						<Input
							id="exam-coach-name"
							value={form.name}
							onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="exam-coach-long">可做多</Label>
						<Input
							id="exam-coach-long"
							value={form.long_limit}
							onChange={(e) => setForm((prev) => ({ ...prev, long_limit: e.target.value }))}
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="exam-coach-short">可做空</Label>
						<Input
							id="exam-coach-short"
							value={form.short_limit}
							onChange={(e) => setForm((prev) => ({ ...prev, short_limit: e.target.value }))}
						/>
					</div>
				</div>
				<Button type="button" size="sm" disabled={disabled} onClick={() => void saveInventory()}>
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
						{desk.inventory.length === 0 ? (
							<TableRow>
								<TableCell colSpan={3} className="text-muted-foreground text-center">
									还没有库存。先加入例如 600519.SH，或直接批准学员的审核中申请（会按数量补库存）。
								</TableCell>
							</TableRow>
						) : (
							desk.inventory.map((row) => (
								<TableRow key={row.id}>
									<TableCell>
										{row.symbol}
										{row.name ? <span className="text-muted-foreground ml-1 text-xs">{row.name}</span> : null}
									</TableCell>
									<TableCell className="text-end">{row.long_limit}</TableCell>
									<TableCell className="text-end">{row.short_limit}</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			<div className="space-y-2">
				<p className="text-xs font-medium">待我审批（审核中 {desk.pendingRequests.length}）</p>
				{desk.pendingRequests.length === 0 ? (
					<p className="text-muted-foreground text-xs">没有审核中的申请。</p>
				) : (
					desk.pendingRequests.map((row) => (
						<div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
							<span>
								{row.student_name ?? row.student_id} · {row.symbol} · {row.side === "short" ? "空头" : "多头"} × {row.quantity}
							</span>
							<div className="flex gap-2">
								<Button size="sm" disabled={disabled} onClick={() => void reviewRequest(row.id, "approve")}>
									批准
								</Button>
								<Button size="sm" variant="outline" disabled={disabled} onClick={() => void reviewRequest(row.id, "reject")}>
									拒绝
								</Button>
							</div>
						</div>
					))
				)}
			</div>

			<div className="space-y-2">
				<p className="text-xs font-medium">直接发放</p>
				<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
					<div className="space-y-1">
						<Label htmlFor="exam-grant-student">学员</Label>
						<select
							id="exam-grant-student"
							className="bg-background w-full rounded-md border px-3 py-2 text-sm"
							value={grant.studentId}
							onChange={(e) => setGrant((prev) => ({ ...prev, studentId: e.target.value }))}
						>
							<option value="">选择已绑定学员</option>
							{acceptedStudents.map((row) => (
								<option key={row.student_id} value={row.student_id}>
									{row.student_name ?? row.student_id}
								</option>
							))}
						</select>
					</div>
					<div className="space-y-1">
						<Label htmlFor="exam-grant-symbol">标的</Label>
						<Input
							id="exam-grant-symbol"
							value={grant.symbol}
							onChange={(e) => setGrant((prev) => ({ ...prev, symbol: e.target.value }))}
							placeholder="600519"
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="exam-grant-side">方向</Label>
						<select
							id="exam-grant-side"
							className="bg-background w-full rounded-md border px-3 py-2 text-sm"
							value={grant.side}
							onChange={(e) => setGrant((prev) => ({ ...prev, side: e.target.value }))}
						>
							<option value="long">多头</option>
							<option value="short">空头</option>
						</select>
					</div>
					<div className="space-y-1">
						<Label htmlFor="exam-grant-qty">数量</Label>
						<Input
							id="exam-grant-qty"
							value={grant.quantity}
							onChange={(e) => setGrant((prev) => ({ ...prev, quantity: e.target.value }))}
						/>
					</div>
				</div>
				<Button type="button" size="sm" disabled={disabled} onClick={() => void grantNow()}>
					立即发放
				</Button>
			</div>
		</div>
	);
}
