"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Row = {
	content: string;
	is_active: boolean;
};

const empty: Row = {
	content: "",
	is_active: true,
};

export function AdminCourseTeaserPanel() {
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
			const res = await fetch("/api/admin/course-teaser", { credentials: "include" });
			const data = (await res.json()) as {
				teaser: { content: string; is_active: boolean } | null;
				error?: string;
			};
			if (!res.ok) {
				setError(data.error ?? t("courseTeaserLoadError"));
				return;
			}
			const r = data.teaser;
			if (r) {
				setRow({
					content: r.content ?? "",
					is_active: r.is_active,
				});
			} else {
				setRow({ ...empty });
			}
		} catch {
			setError(t("courseTeaserLoadError"));
		} finally {
			setLoading(false);
		}
	}, [t]);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			void load();
		}, 0);
		return () => window.clearTimeout(timer);
	}, [load]);

	async function save() {
		setSaving(true);
		setMessage(null);
		setError(null);
		try {
			const res = await fetch("/api/admin/course-teaser", {
				method: "PUT",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					content: row.content.trim(),
					is_active: row.is_active,
				}),
			});
			const data = (await res.json()) as {
				teaser?: { content: string; is_active: boolean };
				error?: string;
			};
			if (!res.ok) {
				setError(data.error ?? t("saveError"));
				return;
			}
			setMessage(t("courseTeaserSaved"));
			if (data.teaser) {
				const r = data.teaser;
				setRow({
					content: r.content ?? "",
					is_active: r.is_active,
				});
			}
		} catch {
			setError(t("saveError"));
		} finally {
			setSaving(false);
		}
	}

	if (loading) {
		return <p className="text-muted-foreground text-sm">...</p>;
	}

	return (
		<div className="max-w-xl space-y-4">
			<div className="space-y-2">
				<Label htmlFor="teaser-content">{t("courseTeaserLabelContent")}</Label>
				<Textarea
					id="teaser-content"
					value={row.content}
					onChange={(e) => setRow({ ...row, content: e.target.value })}
					rows={5}
					placeholder="?????????????"
				/>
			</div>
			<div className="flex items-center gap-2">
				<Checkbox
					id="teaser-active"
					checked={row.is_active}
					onCheckedChange={(v) => setRow({ ...row, is_active: v === true })}
				/>
				<label htmlFor="teaser-active" className="text-sm">
					{t("courseTeaserLabelActive")}
				</label>
			</div>
			<Button type="button" onClick={() => void save()} disabled={saving || !row.content.trim()}>
				{saving ? "..." : t("courseTeaserSave")}
			</Button>
			{message && <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}
			{error && <p className="text-destructive text-sm">{error}</p>}
		</div>
	);
}
