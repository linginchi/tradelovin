"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import type { AssessmentDashboardView, AssessmentModule } from "@/lib/assessment/types";
import { ASSESSMENT_DIMENSION_ORDER } from "@/lib/assessment/types";

type Props = {
	module: AssessmentModule;
	enabled?: boolean;
};

export function ModuleAssessmentDashboard({ module, enabled = true }: Props) {
	const t = useTranslations("Assessment");
	const [view, setView] = useState<AssessmentDashboardView | null>(null);
	const [open, setOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [status, setStatus] = useState<"loading" | "ready" | "hidden" | "error">(
		enabled ? "loading" : "hidden",
	);

	const load = useCallback(async () => {
		if (!enabled) {
			setStatus("hidden");
			return;
		}
		setStatus("loading");
		try {
			const res = await fetch(`/api/assessment/dashboard?module=${module}`, { credentials: "include" });
			const json = (await res.json()) as {
				success?: boolean;
				dashboard?: AssessmentDashboardView;
				error?: string;
			};
			if (res.status === 401) {
				setView(null);
				setStatus("hidden");
				return;
			}
			if (!res.ok || !json.success || !json.dashboard) {
				setError(json.error ?? t("loadFailed"));
				setStatus("error");
				return;
			}
			setError(null);
			setView(json.dashboard);
			setStatus("ready");
		} catch {
			setError(t("loadFailed"));
			setStatus("error");
		}
	}, [enabled, module, t]);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			void load();
		}, 0);
		return () => window.clearTimeout(timer);
	}, [load]);

	useEffect(() => {
		if (view?.mode === "cold-start") setOpen(true);
	}, [view?.mode]);

	if (status === "hidden") return null;

	if (status === "error") {
		return (
			<div className="rounded-xl border border-border/70 bg-card/40 px-3 py-2 text-sm text-muted-foreground">
				{error}
			</div>
		);
	}

	if (status !== "ready" || !view) {
		return (
			<div className="rounded-xl border border-border/70 bg-card/40 px-3 py-3 text-sm text-muted-foreground">
				{t("loading")}
			</div>
		);
	}

	const dimLabel: Record<string, string> = {
		profitability: t("profitability"),
		riskControl: t("riskControl"),
		consistency: t("consistency"),
		activeness: t("activeness"),
	};

	return (
		<section className="rounded-xl border border-cyan-500/20 bg-card/50 px-4 py-3">
			<button
				type="button"
				className="flex w-full flex-wrap items-start justify-between gap-3 text-left"
				aria-expanded={open}
				onClick={() => setOpen((prev) => !prev)}
			>
				<div>
					<p className="text-muted-foreground text-xs tracking-wide">{view.title}</p>
					<p className="mt-1 text-2xl font-semibold tabular-nums">
						{view.score.eligible ? view.score.total.toFixed(1) : "—"}
					</p>
					<p className="text-muted-foreground mt-1 text-xs">
						{view.score.eligible
							? t("scoredHint")
							: t("coldStartHint", { count: view.score.tradeCount, min: view.score.minTrades })}
					</p>
					{view.lab ? (
						<p className="text-muted-foreground mt-1 text-xs">
							{view.lab.access
								? t("labSessions", { count: view.lab.sessionCount })
								: t("labLocked")}
						</p>
					) : null}
				</div>
				<span className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 text-[0.8rem]">
					{open ? t("hideNext") : view.mode === "cold-start" ? t("showStart") : t("showStrengthen")}
				</span>
			</button>
			<ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
				{ASSESSMENT_DIMENSION_ORDER.map((id) => (
					<li key={id} className="rounded-lg border border-border/50 bg-background/40 px-2 py-1.5">
						<p className="text-muted-foreground text-[11px]">{dimLabel[id]}</p>
						<p className="text-sm font-medium tabular-nums">
							{view.score.eligible ? view.score.dimensions[id].toFixed(1) : "—"}
						</p>
					</li>
				))}
			</ul>
			{open ? (
				<ul className="mt-3 space-y-2">
					{view.nextSteps.map((step) => (
						<li key={step.id} className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm">
							<Link href={step.href} className="font-medium text-cyan-200 underline-offset-2 hover:underline">
								{step.title}
							</Link>
							<p className="text-muted-foreground mt-0.5 text-xs">{step.reason}</p>
						</li>
					))}
					{view.adviceLocked && module === "t0" && view.mode === "scored" ? (
						<li className="text-muted-foreground text-xs">{t("adviceLocked")}</li>
					) : null}
				</ul>
			) : null}
		</section>
	);
}
