"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type ScoreRow = {
	score: number | null;
	grade: string | null;
	certificate_url: string | null;
	comment: string | null;
};

type Reg = {
	id: string;
	status: string;
	applied_at: string;
	courses?: { title: string; mode: string | null } | null;
	course_scores?: ScoreRow[] | null;
};

export function MyCoursesClient() {
	const t = useTranslations("MyCoursesPage");
	const tc = useTranslations("CoursesPage");
	const [rows, setRows] = useState<Reg[] | null>(null);
	const [err, setErr] = useState<string | null>(null);

	useEffect(() => {
		let alive = true;
		async function run() {
			const res = await fetch("/api/courses/my-registrations", { credentials: "include" });
			const js = (await res.json()) as { success?: boolean; registrations?: Reg[]; error?: string };
			if (!alive) return;
			if (res.status === 401) {
				setErr("401");
				setRows([]);
				return;
			}
			if (!res.ok || !js.success) {
				setErr(js.error ?? "Error");
				setRows([]);
				return;
			}
			setRows(js.registrations ?? []);
		}
		void run();
		return () => {
			alive = false;
		};
	}, []);

	if (rows === null && !err) {
		return (
			<div className="flex justify-center py-16">
				<Loader2 className="size-8 animate-spin text-cyan-400/70" />
			</div>
		);
	}

	if (err === "401") {
		return <p className="text-muted-foreground text-center text-sm">{tc("needLogin")}</p>;
	}

	if (err) {
		return <p className="text-destructive text-center text-sm">{err}</p>;
	}

	if (!rows?.length) {
		return <p className="text-muted-foreground text-center text-sm">{t("empty")}</p>;
	}

	return (
		<ul className="mx-auto max-w-2xl space-y-4">
			{rows.map((r) => {
				const title = r.courses?.title ?? "—";
				const scores = r.course_scores ?? [];
				const latest = scores[scores.length - 1];
				return (
					<li key={r.id} className="border-border/80 bg-card/40 rounded-xl border p-5 backdrop-blur-sm">
						<div className="flex flex-wrap items-start justify-between gap-2">
							<div>
								<h2 className="font-semibold">{title}</h2>
								<p className="text-muted-foreground text-xs">
									{r.status === "pending"
										? tc("pending")
										: r.status === "approved"
											? tc("approved")
											: tc("rejected")}
								</p>
							</div>
						</div>
						{latest ? (
							<dl className="text-muted-foreground mt-3 grid gap-1 text-xs sm:grid-cols-2">
								<div>
									<dt>{t("score")}</dt>
									<dd className="text-foreground font-medium">{latest.score ?? "—"}</dd>
								</div>
								<div>
									<dt>{t("grade")}</dt>
									<dd className="text-foreground font-medium">{latest.grade ?? "—"}</dd>
								</div>
								{latest.certificate_url ? (
									<div className="sm:col-span-2">
										<dt>{t("cert")}</dt>
										<dd className="text-foreground font-mono text-[10px] break-all">{latest.certificate_url}</dd>
									</div>
								) : null}
							</dl>
						) : null}
					</li>
				);
			})}
		</ul>
	);
}
