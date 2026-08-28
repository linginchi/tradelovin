"use client";

import Link from "next/link";
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
import { cn } from "@/lib/utils";

type EnrollRow = {
	enrollment_id: string;
	student_profile_id: string;
	student_code: string;
	nickname: string | null;
	email: string;
	course_id: string;
	course_title: string;
	payment_status: "paid" | "unpaid" | "refunded";
	refund_reason: string | null;
	enrolled_at: string;
};

type CourseOpt = { id: string; title: string };

export function AdminFeesPanel() {
	const t = useTranslations("Admin");
	const [enrollments, setEnrollments] = useState<EnrollRow[]>([]);
	const [courses, setCourses] = useState<CourseOpt[]>([]);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [subject, setSubject] = useState("????");
	const [body, setBody] = useState("???\n\n???????????\n\n???????????");
	const [html, setHtml] = useState("");
	const [courseFilter, setCourseFilter] = useState("");
	const [payFilter, setPayFilter] = useState("");
	const [dateFrom, setDateFrom] = useState("");
	const [dateTo, setDateTo] = useState("");
	const [loading, setLoading] = useState(true);
	const [sending, setSending] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [result, setResult] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [refundFor, setRefundFor] = useState<EnrollRow | null>(null);
	const [refundReason, setRefundReason] = useState("");

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const q = new URLSearchParams();
			q.set("view", "enrollment");
			if (courseFilter) q.set("course_id", courseFilter);
			if (payFilter === "paid" || payFilter === "unpaid" || payFilter === "refunded") {
				q.set("payment_status", payFilter);
			}
			if (dateFrom) q.set("from", dateFrom);
			if (dateTo) q.set("to", dateTo);
			const res = await fetch(`/api/admin/roster?${q}`, { credentials: "include" });
			const data = (await res.json()) as { enrollments?: EnrollRow[]; error?: string };
			if (res.ok) {
				setEnrollments((data.enrollments ?? []) as EnrollRow[]);
			}
		} finally {
			setLoading(false);
		}
	}, [courseFilter, payFilter, dateFrom, dateTo]);

	const loadCourses = useCallback(async () => {
		const res = await fetch("/api/admin/courses", { credentials: "include" });
		const data = (await res.json()) as { courses?: { id: string; title: string }[] };
		if (res.ok) {
			setCourses((data.courses ?? []).map((c) => ({ id: c.id, title: c.title })));
		}
	}, []);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			void loadCourses();
		}, 0);
		return () => window.clearTimeout(timer);
	}, [loadCourses]);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			void load();
		}, 0);
		return () => window.clearTimeout(timer);
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
					enrollment_ids: Array.from(selected),
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
			setSelected(new Set());
			void load();
		} catch {
			setError(t("saveError"));
		} finally {
			setSending(false);
		}
	}

	async function patchEnrollment(eid: string, payment_status: EnrollRow["payment_status"], refund_reason?: string) {
		const res = await fetch(`/api/admin/student-courses/${eid}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({
				payment_status,
				...(refund_reason !== undefined ? { refund_reason } : {}),
			}),
		});
		if (!res.ok) {
			const j = (await res.json()) as { error?: string };
			setError(j.error ?? t("saveError"));
			return;
		}
		void load();
	}

	function payLabel(s: string) {
		if (s === "paid") return t("payment_paid");
		if (s === "refunded") return t("payment_refunded");
		return t("payment_unpaid");
	}

	return (
		<div className="space-y-6">
			<Card className="border-border/60 bg-card/35">
				<CardHeader>
					<CardTitle className="text-base">{t("sendFee")}</CardTitle>
					<CardDescription>
						{t("feeCardDesc")}{" "}
						<Link href="/staff/pay" className="text-primary underline-offset-4 hover:underline">
							{t("feeQrLink")}
						</Link>
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						<div className="space-y-2">
							<Label htmlFor="bill-course">{t("filterCourse")}</Label>
							<select
								id="bill-course"
								value={courseFilter}
								onChange={(e) => setCourseFilter(e.target.value)}
								className="border-input bg-background h-10 w-full rounded-lg border px-3 text-sm dark:bg-input/30"
							>
								<option value="">{t("allCourses")}</option>
								{courses.map((c) => (
									<option key={c.id} value={c.id}>
										{c.title}
									</option>
								))}
							</select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="bill-pay">{t("filterPayment")}</Label>
							<select
								id="bill-pay"
								value={payFilter}
								onChange={(e) => setPayFilter(e.target.value)}
								className="border-input bg-background h-10 w-full rounded-lg border px-3 text-sm dark:bg-input/30"
							>
								<option value="">{t("filterAll")}</option>
								<option value="unpaid">{t("payment_unpaid")}</option>
								<option value="paid">{t("payment_paid")}</option>
								<option value="refunded">{t("payment_refunded")}</option>
							</select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="bill-from">{t("dateFrom")}</Label>
							<Input
								id="bill-from"
								type="date"
								value={dateFrom}
								onChange={(e) => setDateFrom(e.target.value)}
								className="h-10"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="bill-to">{t("dateTo")}</Label>
							<Input
								id="bill-to"
								type="date"
								value={dateTo}
								onChange={(e) => setDateTo(e.target.value)}
								className="h-10"
							/>
						</div>
					</div>
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

			<div className="rounded-xl border border-border/60 bg-card/25 ring-1 ring-foreground/5 overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-10" />
							<TableHead>{t("colCourse")}</TableHead>
							<TableHead>{t("colStudentId")}</TableHead>
							<TableHead>{t("colNickname")}</TableHead>
							<TableHead>{t("colEmail")}</TableHead>
							<TableHead>{t("colEnrolledAt")}</TableHead>
							<TableHead>{t("colPayment")}</TableHead>
							<TableHead className="hidden lg:table-cell">{t("refundReasonLabel")}</TableHead>
							<TableHead className="text-right">{t("actions")}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{loading ? (
							<TableRow>
								<TableCell colSpan={9} className="text-muted-foreground py-10 text-center">
									???
								</TableCell>
							</TableRow>
						) : enrollments.length === 0 ? (
							<TableRow>
								<TableCell colSpan={9} className="text-muted-foreground py-10 text-center">
									{t("empty")}
								</TableCell>
							</TableRow>
						) : (
							enrollments.map((s) => (
								<TableRow key={s.enrollment_id}>
									<TableCell>
										<Checkbox
											checked={selected.has(s.enrollment_id)}
											onCheckedChange={() => toggle(s.enrollment_id)}
											aria-label={`select ${s.student_code}`}
										/>
									</TableCell>
									<TableCell className="max-w-[140px] truncate text-sm">{s.course_title}</TableCell>
									<TableCell className="font-mono text-xs">{s.student_code}</TableCell>
									<TableCell>{s.nickname ?? "?"}</TableCell>
									<TableCell className="max-w-[140px] truncate font-mono text-xs">{s.email}</TableCell>
									<TableCell className="text-muted-foreground font-mono text-xs tabular-nums">
										{s.enrolled_at?.slice(0, 10)}
									</TableCell>
									<TableCell>{payLabel(s.payment_status)}</TableCell>
									<TableCell className="text-muted-foreground hidden max-w-[160px] truncate text-xs lg:table-cell">
										{s.refund_reason ?? "?"}
									</TableCell>
									<TableCell className="text-right">
										<div className="flex flex-wrap justify-end gap-1">
											{s.payment_status !== "paid" && (
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={() => void patchEnrollment(s.enrollment_id, "paid")}
												>
													{t("markPaid")}
												</Button>
											)}
											{s.payment_status !== "unpaid" && s.payment_status !== "refunded" && (
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={() => void patchEnrollment(s.enrollment_id, "unpaid")}
												>
													{t("markUnpaid")}
												</Button>
											)}
											{s.payment_status !== "refunded" && (
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={() => {
														setRefundFor(s);
														setRefundReason("");
													}}
												>
													{t("markRefunded")}
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
							{sending ? "..." : t("sendFee")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={refundFor !== null}
				onOpenChange={(o) => {
					if (!o) {
						setRefundFor(null);
						setRefundReason("");
					}
				}}
			>
				<DialogContent className="sm:max-w-md" showCloseButton>
					<DialogHeader>
						<DialogTitle>{t("refundDialogTitle")}</DialogTitle>
						<DialogDescription>{t("refundReasonLabel")}</DialogDescription>
					</DialogHeader>
					<Textarea
						value={refundReason}
						onChange={(e) => setRefundReason(e.target.value)}
						className={cn("min-h-[100px]", !refundReason.trim() && "border-destructive/50")}
					/>
					<DialogFooter className="border-t-0 bg-transparent p-0 sm:justify-end">
						<Button type="button" variant="outline" onClick={() => setRefundFor(null)}>
							{t("cancel")}
						</Button>
						<Button
							type="button"
							disabled={!refundReason.trim() || !refundFor}
							onClick={() => {
								if (!refundFor) return;
								void patchEnrollment(refundFor.enrollment_id, "refunded", refundReason.trim());
								setRefundFor(null);
								setRefundReason("");
							}}
						>
							{t("markRefunded")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
