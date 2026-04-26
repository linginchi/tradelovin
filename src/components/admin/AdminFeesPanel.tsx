"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

type RosterRow = {
	id: string;
	student_id: string;
	nickname: string | null;
	email: string;
	payment_status: "paid" | "unpaid" | "refunded";
};

export function AdminFeesPanel() {
	const t = useTranslations("Admin");
	const [roster, setRoster] = useState<RosterRow[]>([]);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [subject, setSubject] = useState("缴费通知");
	const [body, setBody] = useState(
		"您好，\n\n请按后续说明完成缴费。\n\n此邮件由系统自动发送。",
	);
	const [html, setHtml] = useState("");
	const [loading, setLoading] = useState(true);
	const [sending, setSending] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [result, setResult] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch("/api/admin/roster", { credentials: "include" });
			const data = (await res.json()) as { students?: RosterRow[] };
			if (res.ok) setRoster(data.students ?? []);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	function toggle(id: string) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	async function send() {
		if (selected.size === 0) return;
		setSending(true);
		setError(null);
		setResult(null);
		setConfirmOpen(false);
		try {
			const res = await fetch("/api/admin/fee/send", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					student_record_ids: Array.from(selected),
					subject: subject.trim(),
					body: body.trim(),
					...(html.trim() ? { html: html.trim() } : {}),
				}),
			});
			const data = (await res.json()) as {
				ok?: boolean;
				sent?: number;
				failed?: number;
				errors?: string[];
				error?: string;
			};
			if (!res.ok) {
				setError(data.error ?? t("saveError"));
				return;
			}
			setResult(t("feeResult", { sent: data.sent ?? 0, failed: data.failed ?? 0 }));
			void load();
		} catch {
			setError(t("saveError"));
		} finally {
			setSending(false);
		}
	}

	async function togglePayment(id: string, next: "paid" | "unpaid") {
		await fetch(`/api/admin/student-records/${id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({ payment_status: next }),
		});
		void load();
	}

	return (
		<div className="space-y-6">
			<Card className="border-border/60 bg-card/35">
				<CardHeader>
					<CardTitle className="text-base">{t("sendFee")}</CardTitle>
					<CardDescription>{t("feeCardDesc")}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="fee-subject">{t("feeSubject")}</Label>
						<Input
							id="fee-subject"
							value={subject}
							onChange={(e) => setSubject(e.target.value)}
							className="h-10"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="fee-body">{t("feeBody")}</Label>
						<Textarea
							id="fee-body"
							value={body}
							onChange={(e) => setBody(e.target.value)}
							className="min-h-[120px]"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="fee-html">{t("feeHtml")}</Label>
						<Textarea
							id="fee-html"
							value={html}
							onChange={(e) => setHtml(e.target.value)}
							className="min-h-[80px] font-mono text-xs"
						/>
					</div>
					<Button
						type="button"
						disabled={sending || selected.size === 0}
						onClick={() => setConfirmOpen(true)}
					>
						{t("sendFee")} ({selected.size})
					</Button>
					{result && <p className="text-sm text-emerald-600 dark:text-emerald-400">{result}</p>}
					{error && <p className="text-destructive text-sm">{error}</p>}
				</CardContent>
			</Card>

			<div className="rounded-xl border border-border/60 bg-card/25 ring-1 ring-foreground/5">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-10" />
							<TableHead>{t("colStudentId")}</TableHead>
							<TableHead>{t("colNickname")}</TableHead>
							<TableHead>{t("colEmail")}</TableHead>
							<TableHead>{t("colPayment")}</TableHead>
							<TableHead className="text-right">{t("actions")}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{loading ? (
							<TableRow>
								<TableCell colSpan={6} className="text-muted-foreground py-10 text-center">
									…
								</TableCell>
							</TableRow>
						) : (
							roster.map((s) => (
								<TableRow key={s.id}>
									<TableCell>
										<Checkbox
											checked={selected.has(s.id)}
											onCheckedChange={() => toggle(s.id)}
											aria-label={`select ${s.student_id}`}
										/>
									</TableCell>
									<TableCell className="font-mono text-xs">{s.student_id}</TableCell>
									<TableCell>{s.nickname ?? "—"}</TableCell>
									<TableCell className="font-mono text-xs">{s.email}</TableCell>
									<TableCell>
										{s.payment_status === "paid"
											? t("payment_paid")
											: s.payment_status === "refunded"
												? t("payment_refunded")
												: t("payment_unpaid")}
									</TableCell>
									<TableCell className="text-right">
										<div className="flex flex-wrap justify-end gap-1">
											{s.payment_status !== "paid" && (
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={() => void togglePayment(s.id, "paid")}
												>
													{t("markPaid")}
												</Button>
											)}
											{s.payment_status !== "unpaid" && (
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={() => void togglePayment(s.id, "unpaid")}
												>
													{t("markUnpaid")}
												</Button>
											)}
										</div>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			<Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<DialogContent className="sm:max-w-md" showCloseButton>
					<DialogHeader>
						<DialogTitle>{t("sendFeeConfirmTitle")}</DialogTitle>
						<DialogDescription>
							{t("sendFeeConfirmDesc", { count: selected.size })}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="gap-2 border-t-0 bg-transparent p-0 sm:justify-end">
						<Button type="button" variant="outline" disabled={sending} onClick={() => setConfirmOpen(false)}>
							{t("cancel")}
						</Button>
						<Button type="button" disabled={sending} onClick={() => void send()}>
							{sending ? "…" : t("sendFee")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
