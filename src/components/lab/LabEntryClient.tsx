"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { canAccessLabFromHint } from "@/lib/lab/access";
import { useMembershipCurrent } from "@/lib/membership/client";
import { useAuth } from "@/lib/auth/use-auth";

type LabSessionRow = {
	id: string;
	sessionType: string;
	inputSummary: string;
	outputJson: {
		summary?: string;
		riskThemes?: string[];
		disclaimer?: string;
	};
	provider: string;
	model: string;
	createdAt: string;
};

export function LabEntryClient() {
	const t = useTranslations("Lab");
	const { status: authStatus } = useAuth();
	const isAuthed = authStatus === "authenticated";
	const { membership } = useMembershipCurrent(isAuthed);
	const allowed = canAccessLabFromHint(membership);

	const [sessions, setSessions] = useState<LabSessionRow[]>([]);
	const [loadingHistory, setLoadingHistory] = useState(false);
	const [entering, setEntering] = useState(false);

	const loadHistory = useCallback(async () => {
		if (!isAuthed || !allowed) {
			setSessions([]);
			return;
		}
		setLoadingHistory(true);
		try {
			const res = await fetch("/api/lab/session?limit=10", { credentials: "include" });
			const json = (await res.json()) as {
				success?: boolean;
				sessions?: LabSessionRow[];
				error?: string;
			};
			if (!res.ok || !json.success) {
				if (res.status !== 403) toast.error(json.error ?? t("loadHistoryFailed"));
				setSessions([]);
				return;
			}
			setSessions(json.sessions ?? []);
		} catch {
			toast.error(t("loadHistoryFailed"));
		} finally {
			setLoadingHistory(false);
		}
	}, [allowed, isAuthed, t]);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			void loadHistory();
		}, 0);
		return () => window.clearTimeout(timer);
	}, [loadHistory]);

	async function enterLab() {
		if (entering) return;
		setEntering(true);
		try {
			const res = await fetch("/api/lab/sso", { method: "POST", credentials: "include" });
			const json = (await res.json()) as {
				success?: boolean;
				code?: string;
				labBaseUrl?: string | null;
				error?: string;
			};
			if (!res.ok || !json.success || !json.code) {
				toast.error(json.error ?? t("enterFailed"));
				return;
			}
			if (!json.labBaseUrl) {
				toast.message(t("labNotConfigured"));
				return;
			}
			const url = `${json.labBaseUrl}/sso/callback?code=${encodeURIComponent(json.code)}`;
			window.location.assign(url);
		} catch {
			toast.error(t("enterFailed"));
		} finally {
			setEntering(false);
		}
	}

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6">
			<header className="space-y-3">
				<p className="text-xs font-medium tracking-wide text-cyan-300/80">{t("kicker")}</p>
				<h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
					{t("title")}
				</h1>
				<p className="text-sm leading-relaxed text-muted-foreground sm:text-base">{t("tagline")}</p>
				<p className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs text-muted-foreground">
					{t("globalNarrative")}
				</p>
			</header>

			<section className="grid gap-4 sm:grid-cols-2">
				<div className="rounded-xl border border-border/70 bg-background/60 p-4">
					<h2 className="text-sm font-semibold text-foreground">{t("doesTitle")}</h2>
					<ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
						<li>{t("does1")}</li>
						<li>{t("does2")}</li>
						<li>{t("does3")}</li>
					</ul>
				</div>
				<div className="rounded-xl border border-border/70 bg-background/60 p-4">
					<h2 className="text-sm font-semibold text-foreground">{t("doesNotTitle")}</h2>
					<ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
						<li>{t("doesNot1")}</li>
						<li>{t("doesNot2")}</li>
						<li>{t("doesNot3")}</li>
					</ul>
				</div>
			</section>

			<p className="text-xs text-amber-200/80">{t("compliance")}</p>

			<div className="flex flex-wrap items-center gap-3">
				{allowed ? (
					<Button type="button" onClick={() => void enterLab()} disabled={entering}>
						{entering ? t("entering") : t("enterCta")}
					</Button>
				) : (
					<>
						<Button type="button" disabled variant="secondary">
							{t("lockedCta")}
						</Button>
						<Link
							href="/membership"
							className="text-sm text-cyan-300 underline underline-offset-4"
						>
							{t("upgradeLink")}
						</Link>
					</>
				)}
				<Link href="/trade" className="text-sm text-muted-foreground underline underline-offset-4">
					{t("goTrade")}
				</Link>
			</div>

			<section className="space-y-3">
				<h2 className="text-sm font-semibold text-foreground">{t("historyTitle")}</h2>
				{!allowed ? (
					<p className="text-sm text-muted-foreground">{t("historyLocked")}</p>
				) : loadingHistory ? (
					<p className="text-sm text-muted-foreground">{t("historyLoading")}</p>
				) : sessions.length === 0 ? (
					<p className="text-sm text-muted-foreground">{t("historyEmpty")}</p>
				) : (
					<ul className="space-y-3">
						{sessions.map((s) => (
							<li
								key={s.id}
								className="rounded-xl border border-border/60 bg-background/50 px-4 py-3 text-sm"
							>
								<div className="flex flex-wrap items-baseline justify-between gap-2">
									<span className="font-medium text-foreground">
										{s.outputJson?.summary?.slice(0, 80) || s.inputSummary || t("historyItemFallback")}
									</span>
									<span className="text-xs text-muted-foreground">
										{new Date(s.createdAt).toLocaleString()} · {s.provider}/{s.model}
									</span>
								</div>
								{s.outputJson?.riskThemes?.length ? (
									<p className="mt-1 text-xs text-muted-foreground">
										{s.outputJson.riskThemes.slice(0, 3).join(" · ")}
									</p>
								) : null}
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
