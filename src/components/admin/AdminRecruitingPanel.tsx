"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Row = {
	title: string;
	description: string;
	start_date: string;
	enrollment_url: string;
	is_active: boolean;
	course_id: string;
};

const empty: Row = {
	title: "",
	description: "",
	start_date: "",
	enrollment_url: "/register",
	is_active: true,
	course_id: "",
};

export function AdminRecruitingPanel() {
	const t = useTranslations("Admin");
	const [row, setRow] = useState<Row>(empty);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/admin/recruiting", { credentials: "include" });
			const data = (await res.json()) as {
				recruiting: {
					title: string;
					description: string | null;
					start_date: string | null;
					enrollment_url: string;
					is_active: boolean;
					course_id: string | null;
				} | null;
				error?: string;
			};
			if (!res.ok) {
				setError(data.error ?? t("recruitingLoadError"));
				return;
			}
			const r = data.recruiting;
			if (r) {
				setRow({
					title: r.title,
					description: r.description ?? "",
					start_date: r.start_date ?? "",
					enrollment_url: r.enrollment_url,
					is_active: r.is_active,
					course_id: r.course_id ?? "",
				});
			} else {
				setRow({ ...empty });
			}
		} catch {
			setError(t("recruitingLoadError"));
		} finally {
			setLoading(false);
		}
	}, [t]);

	useEffect(() => {
		void load();
	}, [load]);

	async function save() {
		setSaving(true);
		setMessage(null);
		setError(null);
		const courseId = row.course_id.trim();
		try {
			const res = await fetch("/api/admin/recruiting", {
				method: "PUT",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					title: row.title.trim(),
					description: row.description.trim() || null,
					start_date: row.start_date.trim() || null,
					enrollment_url: row.enrollment_url.trim() || "/register",
					is_active: row.is_active,
					course_id: courseId ? courseId : null,
				}),
			});
			const data = (await res.json()) as {
				recruiting?: {
					title: string;
					description: string | null;
					start_date: string | null;
					enrollment_url: string;
					is_active: boolean;
					course_id: string | null;
				};
				error?: string;
			};
			if (!res.ok) {
				setError(data.error ?? t("saveError"));
				return;
			}
			setMessage(t("recruitingSaved"));
			if (data.recruiting) {
				const r = data.recruiting;
				setRow({
					title: r.title,
					description: r.description ?? "",
					start_date: r.start_date ?? "",
					enrollment_url: r.enrollment_url,
					is_active: r.is_active,
					course_id: r.course_id ?? "",
				});
			}
		} catch {
			setError(t("saveError"));
		} finally {
			setSaving(false);
		}
	}

	if (loading) {
		return <p className="text-muted-foreground text-sm">…</p>;
	}

	return (
		<div className="max-w-xl space-y-4">
			<div className="space-y-2">
				<Label htmlFor="rec-title">{t("recruitingLabelTitle")}</Label>
				<Input
					id="rec-title"
					value={row.title}
					onChange={(e) => setRow({ ...row, title: e.target.value })}
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="rec-desc">{t("recruitingLabelDesc")}</Label>
				<Textarea
					id="rec-desc"
					value={row.description}
					onChange={(e) => setRow({ ...row, description: e.target.value })}
					rows={4}
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="rec-start">{t("recruitingLabelStart")}</Label>
				<Input
					id="rec-start"
					value={row.start_date}
					onChange={(e) => setRow({ ...row, start_date: e.target.value })}
					placeholder="2026-06-01"
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="rec-url">{t("recruitingLabelUrl")}</Label>
				<Input
					id="rec-url"
					value={row.enrollment_url}
					onChange={(e) => setRow({ ...row, enrollment_url: e.target.value })}
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="rec-cid">{t("recruitingLabelCourseId")}</Label>
				<Input
					id="rec-cid"
					value={row.course_id}
					onChange={(e) => setRow({ ...row, course_id: e.target.value })}
				/>
			</div>
			<div className="flex items-center gap-2">
				<Checkbox
					id="rec-active"
					checked={row.is_active}
					onCheckedChange={(v) => setRow({ ...row, is_active: v === true })}
				/>
				<label htmlFor="rec-active" className="text-sm">
					{t("recruitingLabelActive")}
				</label>
			</div>
			<Button type="button" onClick={() => void save()} disabled={saving || !row.title.trim()}>
				{saving ? "…" : t("recruitingSave")}
			</Button>
			{message && <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}
			{error && <p className="text-destructive text-sm">{error}</p>}
		</div>
	);
}
