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
import { Textarea } from "@/components/ui/textarea";
import type { RegistrationRow } from "@/components/admin/AdminStudentsPanel";

export function AdminReviewsPanel() {
	const t = useTranslations("Admin");
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
			const res = await fetch("/api/admin/students?status=pending", { credentials: "include" });
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
	}, [t]);

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
			const data = (await res.json()) as { error?: string };
			if (!res.ok) {
				setError(data.error ?? t("saveError"));
				return;
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

	return (
		<div className="space-y-4">
			{error && <p className="text-destructive text-sm">{error}</p>}

			<div className="rounded-xl border border-border/60 bg-card/30 ring-1 ring-foreground/5 backdrop-blur-sm">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t("colCreated")}</TableHead>
							<TableHead>{t("colNickname")}</TableHead>
							<TableHead>{t("colRealName")}</TableHead>
							<TableHead className="min-w-[140px]">{t("colEmail")}</TableHead>
							<TableHead className="text-right">{t("actions")}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{loading ? (
							<TableRow>
								<TableCell colSpan={5} className="text-muted-foreground py-10 text-center">
									…
								</TableCell>
							</TableRow>
						) : rows.length === 0 ? (
							<TableRow>
								<TableCell colSpan={5} className="text-muted-foreground py-10 text-center">
									{t("empty")}
								</TableCell>
							</TableRow>
						) : (
							rows.map((r) => (
								<TableRow key={r.id}>
									<TableCell className="text-muted-foreground font-mono text-xs tabular-nums">
										{r.created_at?.slice(0, 10)}
									</TableCell>
									<TableCell className="font-medium">{r.nickname}</TableCell>
									<TableCell>{r.real_name ?? "—"}</TableCell>
									<TableCell className="max-w-[200px] truncate font-mono text-xs">{r.email}</TableCell>
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
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

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
						className="min-h-[100px]"
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
