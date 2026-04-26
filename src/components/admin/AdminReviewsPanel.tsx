"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { RegistrationRow } from "@/components/admin/AdminStudentsPanel";
import { cn } from "@/lib/utils";

export function AdminReviewsPanel() {
	const t = useTranslations("Admin");
	const [tab, setTab] = useState<"pending" | "history">("pending");
	const [rows, setRows] = useState<RegistrationRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [rejectForId, setRejectForId] = useState<string | null>(null);
	const [rejectReason, setRejectReason] = useState("");

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const q = tab === "pending" ? "review_scope=pending" : "review_scope=reviewed";
			const res = await fetch(`/api/admin/students?${q}`, { credentials: "include" });
			const data = (await res.json()) as { students?: RegistrationRow[]; error?: string };
			if (!res.ok) {
				setError(data.error ?? t("loadError"));
				return;
			}
			setRows(data.students ?? []);
		} catch {
			setError(t("loadError"));
		} finally {
			setLoading(false);
		}
	}, [t, tab]);

	useEffect(() => {
		void load();
	}, [load]);

	async function approve(id: string) {
		setBusyId(id);
		setError(null);
		try {
			const res = await fetch(`/api/admin/registrations/${id}/review`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ action: "approve" }),
			});
			const data = (await res.json()) as { error?: string };
			if (!res.ok) {
				setError(data.error ?? t("saveError"));
				return;
			}
			void load();
		} catch {
			setError(t("saveError"));
		} finally {
			setBusyId(null);
		}
	}

	async function submitReject() {
		if (!rejectForId || !rejectReason.trim()) return;
		setBusyId(rejectForId);
		setError(null);
		try {
			const res = await fetch(`/api/admin/registrations/${rejectForId}/review`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ action: "reject", reason: rejectReason.trim() }),
			});
			const data = (await res.json()) as { error?: string; emailWarning?: string };
			if (!res.ok) {
				setError(data.error ?? t("saveError"));
				return;
			}
			if (data.emailWarning) {
				setError(`邮件未发送：${data.emailWarning}`);
			}
			setRejectForId(null);
			setRejectReason("");
			void load();
		} catch {
			setError(t("saveError"));
		} finally {
			setBusyId(null);
		}
	}

	function fmtPrefs(p: RegistrationRow["trading_style_preferences"]) {
		if (!p || !Array.isArray(p)) return "—";
		return p.length ? p.join(", ") : "—";
	}

	function renderTable(mode: "pending" | "history") {
		return (
			<div className="rounded-xl border border-border/60 bg-card/30 ring-1 ring-foreground/5 backdrop-blur-sm overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t("colCreated")}</TableHead>
							{mode === "history" && <TableHead>{t("colReviewedAt")}</TableHead>}
							<TableHead>{t("colNickname")}</TableHead>
							<TableHead>{t("colRealName")}</TableHead>
							<TableHead className="min-w-[120px]">{t("colEmail")}</TableHead>
							<TableHead className="hidden xl:table-cell">{t("colPhone")}</TableHead>
							<TableHead className="hidden lg:table-cell">{t("colExp")}</TableHead>
							<TableHead className="hidden lg:table-cell">{t("colStyle")}</TableHead>
							<TableHead className="hidden md:table-cell max-w-[180px]">{t("learningGoals")}</TableHead>
							{mode === "history" && (
								<>
									<TableHead>{t("colStatus")}</TableHead>
									<TableHead className="hidden lg:table-cell">{t("colRejection")}</TableHead>
								</>
							)}
							{mode === "pending" && <TableHead className="text-right">{t("actions")}</TableHead>}
						</TableRow>
					</TableHeader>
					<TableBody>
						{loading ? (
							<TableRow>
								<TableCell
									colSpan={mode === "pending" ? 9 : 11}
									className="text-muted-foreground py-10 text-center"
								>
									…
								</TableCell>
							</TableRow>
						) : rows.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={mode === "pending" ? 9 : 11}
									className="text-muted-foreground py-10 text-center"
								>
									{t("empty")}
								</TableCell>
							</TableRow>
						) : (
							rows.map((r) => (
								<TableRow key={r.id}>
									<TableCell className="text-muted-foreground font-mono text-xs tabular-nums">
										{r.created_at?.slice(0, 10)}
									</TableCell>
									{mode === "history" && (
										<TableCell className="text-muted-foreground font-mono text-xs">
											{(r as { reviewed_at?: string }).reviewed_at?.slice(0, 16).replace("T", " ") ?? "—"}
										</TableCell>
									)}
									<TableCell className="font-medium">{r.nickname}</TableCell>
									<TableCell>{r.real_name ?? "—"}</TableCell>
									<TableCell className="max-w-[160px] truncate font-mono text-xs">{r.email}</TableCell>
									<TableCell className="hidden xl:table-cell">{r.phone ?? "—"}</TableCell>
									<TableCell className="hidden max-w-[120px] truncate text-xs lg:table-cell">
										{r.trading_experience ?? "—"}
									</TableCell>
									<TableCell className="hidden max-w-[120px] truncate text-xs lg:table-cell">
										{fmtPrefs(r.trading_style_preferences)}
									</TableCell>
									<TableCell className="text-muted-foreground hidden max-w-[200px] truncate text-xs md:table-cell">
										{r.learning_goals ?? "—"}
									</TableCell>
									{mode === "history" && (
										<>
											<TableCell>
												{r.status === "approved"
													? t("status_approved")
													: r.status === "rejected"
														? t("status_rejected")
														: (r.status ?? "—")}
											</TableCell>
											<TableCell className="text-muted-foreground hidden max-w-[200px] truncate text-xs lg:table-cell">
												{r.rejection_reason ?? "—"}
											</TableCell>
										</>
									)}
									{mode === "pending" && (
										<TableCell className="text-right">
											<div className="flex flex-wrap justify-end gap-2">
												<Button
													type="button"
													size="sm"
													disabled={busyId !== null}
													onClick={() => void approve(r.id)}
												>
													{t("approve")}
												</Button>
												<Button
													type="button"
													size="sm"
													variant="outline"
													disabled={busyId !== null}
													onClick={() => {
														setRejectForId(r.id);
														setRejectReason("");
													}}
												>
													{t("reject")}
												</Button>
											</div>
										</TableCell>
									)}
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<Tabs
				value={tab}
				onValueChange={(v) => setTab(v as "pending" | "history")}
				className="w-full"
			>
				<TabsList className="w-full max-w-md">
					<TabsTrigger value="pending" className="flex-1">
						{t("tabPendingReviews")}
					</TabsTrigger>
					<TabsTrigger value="history" className="flex-1">
						{t("tabReviewHistory")}
					</TabsTrigger>
				</TabsList>
				<TabsContent value="pending" className="mt-4 space-y-3">
					{error && <p className="text-destructive text-sm">{error}</p>}
					{renderTable("pending")}
				</TabsContent>
				<TabsContent value="history" className="mt-4 space-y-3">
					{error && <p className="text-destructive text-sm">{error}</p>}
					{renderTable("history")}
				</TabsContent>
			</Tabs>

			<Dialog
				open={rejectForId !== null}
				onOpenChange={(open) => {
					if (!open) {
						setRejectForId(null);
						setRejectReason("");
					}
				}}
			>
				<DialogContent className="sm:max-w-md" showCloseButton>
					<DialogHeader>
						<DialogTitle>{t("reject")}</DialogTitle>
						<DialogDescription>{t("rejectDialogDesc")}</DialogDescription>
					</DialogHeader>
					<Textarea
						value={rejectReason}
						onChange={(e) => setRejectReason(e.target.value)}
						placeholder={t("rejectReason")}
						className={cn("min-h-[100px]", !rejectReason.trim() && "border-destructive/30")}
					/>
					<DialogFooter className="border-t-0 bg-transparent p-0 sm:justify-end">
						<Button
							type="button"
							variant="outline"
							disabled={busyId !== null}
							onClick={() => {
								setRejectForId(null);
								setRejectReason("");
							}}
						>
							{t("cancel")}
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={busyId !== null || !rejectReason.trim()}
							onClick={() => void submitReject()}
						>
							{t("reject")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
