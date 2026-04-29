"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AppRow = {
	id: string;
	user_id: string;
	status: string;
	target_role: string | null;
	target_company: string | null;
	profile: { email: string | null; nickname: string | null } | null;
};

const STEPS = ["resume_screening", "interview", "assessment", "offer", "onboarded"] as const;
const PROG_STATUS = ["pending", "completed", "rejected"] as const;

export function AdminJobApplicationsClient() {
	const t = useTranslations("Admin");
	const tCareer = useTranslations("CareerPage");
	const [rows, setRows] = useState<AppRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [selId, setSelId] = useState("");
	const [step, setStep] = useState<(typeof STEPS)[number]>("resume_screening");
	const [pStatus, setPStatus] = useState<(typeof PROG_STATUS)[number]>("pending");
	const [notes, setNotes] = useState("");
	const [appStatus, setAppStatus] = useState<"pending" | "reviewing" | "approved" | "rejected">("pending");

	const reload = useCallback(async () => {
		const res = await fetch("/api/admin/job-applications");
		const js = (await res.json()) as { applications?: AppRow[] };
		if (res.ok) setRows(js.applications ?? []);
	}, []);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			void reload().finally(() => setLoading(false));
		}, 0);
		return () => window.clearTimeout(timer);
	}, [reload]);

	async function saveApplicationStatus(e: React.FormEvent) {
		e.preventDefault();
		if (!selId) return;
		const res = await fetch(`/api/admin/job-applications/${selId}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ status: appStatus }),
		});
		if (!res.ok) {
			toast.error(t("saveError"));
			return;
		}
		toast.success(t("saved"));
		void reload();
	}

	async function saveProgress(e: React.FormEvent) {
		e.preventDefault();
		if (!selId) return;
		const res = await fetch(`/api/admin/job-applications/${selId}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				progress: { step, status: pStatus, notes: notes.trim() || null },
			}),
		});
		if (!res.ok) {
			toast.error(t("saveError"));
			return;
		}
		toast.success(t("saved"));
		setNotes("");
	}

	if (loading) {
		return (
			<p className="text-muted-foreground text-sm" role="status" aria-live="polite">
				{t("loading")}
			</p>
		);
	}

	return (
		<div className="space-y-10">
			<div className="overflow-x-auto rounded-lg border border-border/60">
				<table className="w-full min-w-[560px] text-left text-sm">
					<thead className="bg-muted/30 border-b border-border/60">
						<tr>
							<th className="p-3 font-medium">{t("colJobUser")}</th>
							<th className="p-3 font-medium">{tCareer("targetRole")}</th>
							<th className="p-3 font-medium">{t("colStatus")}</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr key={r.id} className="border-border/40 border-b">
								<td className="p-3">{r.profile?.email ?? r.user_id}</td>
								<td className="p-3">{r.target_role ?? "�"}</td>
								<td className="p-3">{r.status}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<div className="grid gap-8 md:grid-cols-2">
				<form className="bg-card/20 space-y-4 rounded-xl border border-border/60 p-6" onSubmit={saveApplicationStatus}>
					<h2 className="text-base font-semibold">{t("colStatus")}</h2>
					<div className="space-y-2">
						<Label>{t("jobAppId")}</Label>
						<Input
							value={selId}
							onChange={(e) => setSelId(e.target.value)}
							className="font-mono text-xs"
							placeholder="uuid"
							required
						/>
					</div>
					<div className="space-y-2">
						<Label>{t("colStatus")}</Label>
						<select
							className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
							value={appStatus}
							onChange={(e) => setAppStatus(e.target.value as typeof appStatus)}
						>
							<option value="pending">{t("status_pending")}</option>
							<option value="reviewing">{t("status_reviewing")}</option>
							<option value="approved">{t("status_approved")}</option>
							<option value="rejected">{t("status_rejected")}</option>
						</select>
					</div>
					<Button type="submit">{t("save")}</Button>
				</form>

				<form className="bg-card/20 space-y-4 rounded-xl border border-border/60 p-6" onSubmit={saveProgress}>
					<h2 className="text-base font-semibold">{t("saveProgress")}</h2>
					<div className="space-y-2">
						<Label>{t("jobAppId")}</Label>
						<Input
							value={selId}
							onChange={(e) => setSelId(e.target.value)}
							className="font-mono text-xs"
							placeholder="uuid"
							required
						/>
					</div>
					<div className="space-y-2">
						<Label>{t("colProgressStep")}</Label>
						<select
							className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
							value={step}
							onChange={(e) => setStep(e.target.value as (typeof STEPS)[number])}
						>
							{STEPS.map((s) => (
								<option key={s} value={s}>
									{s}
								</option>
							))}
						</select>
					</div>
					<div className="space-y-2">
						<Label>{t("colProgressStatus")}</Label>
						<select
							className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
							value={pStatus}
							onChange={(e) => setPStatus(e.target.value as (typeof PROG_STATUS)[number])}
						>
							{PROG_STATUS.map((s) => (
								<option key={s} value={s}>
									{s}
								</option>
							))}
						</select>
					</div>
					<div className="space-y-2">
						<Label>{t("notes")}</Label>
						<Input value={notes} onChange={(e) => setNotes(e.target.value)} />
					</div>
					<Button type="submit">{t("saveProgress")}</Button>
				</form>
			</div>
		</div>
	);
}
