"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Row = {
	id: string;
	user_id: string;
	status: string;
	applied_at: string;
	courses: { title: string; mode: string | null } | null;
	profile: { email: string | null; nickname: string | null } | null;
};

export function AdminCourseRegistrationsClient() {
	const t = useTranslations("Admin");
	const [rows, setRows] = useState<Row[]>([]);
	const [loading, setLoading] = useState(true);

	const reload = useCallback(async () => {
		const res = await fetch("/api/admin/course-registrations");
		const js = (await res.json()) as { registrations?: Row[] };
		if (res.ok) setRows(js.registrations ?? []);
	}, []);

	useEffect(() => {
		void reload().finally(() => setLoading(false));
	}, [reload]);

	async function review(id: string, status: "approved" | "rejected") {
		const res = await fetch(`/api/admin/course-registrations/${id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ status }),
		});
		if (!res.ok) {
			toast.error("Failed");
			return;
		}
		toast.success("OK");
		void reload();
	}

	async function onScoreSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const form = e.currentTarget;
		const fd = new FormData(form);
		const res = await fetch("/api/admin/course-scores", { method: "POST", body: fd });
		const js = (await res.json()) as { error?: string };
		if (!res.ok) {
			toast.error(js.error ?? "Error");
			return;
		}
		toast.success("Saved");
		form.reset();
	}

	if (loading) {
		return <p className="text-muted-foreground text-sm">…</p>;
	}

	return (
		<div className="space-y-10">
			<div className="overflow-x-auto rounded-lg border border-border/60">
				<table className="w-full min-w-[640px] text-left text-sm">
					<thead className="bg-muted/30 border-b border-border/60">
						<tr>
							<th className="p-3 font-medium">{t("colCourse")}</th>
							<th className="p-3 font-medium">{t("colEmail")}</th>
							<th className="p-3 font-medium">{t("colStatus")}</th>
							<th className="p-3 font-medium">{t("colAppliedAt")}</th>
							<th className="p-3 font-medium">{t("actions")}</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr key={r.id} className="border-border/40 border-b">
								<td className="p-3">{r.courses?.title ?? "—"}</td>
								<td className="p-3">{r.profile?.email ?? r.user_id}</td>
								<td className="p-3">{r.status}</td>
								<td className="text-muted-foreground p-3 text-xs">
									{r.applied_at ? new Date(r.applied_at).toLocaleString() : "—"}
								</td>
								<td className="p-3">
									<div className="flex flex-wrap gap-2">
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={() => void review(r.id, "approved")}
										>
											{t("approve")}
										</Button>
										<Button
											type="button"
											size="sm"
											variant="destructive"
											onClick={() => void review(r.id, "rejected")}
										>
											{t("reject")}
										</Button>
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<form className="bg-card/20 space-y-4 rounded-xl border border-border/60 p-6" onSubmit={onScoreSubmit}>
				<h2 className="text-base font-semibold">{t("uploadScore")}</h2>
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-2 sm:col-span-2">
						<Label htmlFor="registrationId">registration id</Label>
						<Input id="registrationId" name="registrationId" required className="font-mono text-xs" />
					</div>
					<div className="space-y-2">
						<Label htmlFor="score">score</Label>
						<Input id="score" name="score" type="number" step="0.01" />
					</div>
					<div className="space-y-2">
						<Label htmlFor="grade">grade</Label>
						<Input id="grade" name="grade" />
					</div>
					<div className="space-y-2 sm:col-span-2">
						<Label htmlFor="cfile">certificate file</Label>
						<Input id="cfile" name="file" type="file" />
					</div>
				</div>
				<Button type="submit">{t("uploadScore")}</Button>
			</form>
		</div>
	);
}
