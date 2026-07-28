"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

/**
 * Minimal Lab entry placeholder for the restored homepage fourth entrance.
 * Full Lab SSO / session APIs remain out of scope for this hotfix.
 */
export function LabEntryClient() {
	const t = useTranslations("Lab");

	return (
		<main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
			<p className="text-primary/90 flex items-center gap-2 text-[10px] font-semibold tracking-wide uppercase">
				{t("kicker")}
			</p>
			<h1 className="text-foreground text-3xl font-bold tracking-tight md:text-4xl">
				{t("title")}
			</h1>
			<p className="text-muted-foreground text-pretty text-sm leading-relaxed md:text-base">
				{t("tagline")}
			</p>
			<p className="border-border/60 bg-muted/20 text-muted-foreground rounded-xl border px-4 py-3 text-sm leading-relaxed">
				{t("labNotConfigured")}
			</p>
			<p className="text-muted-foreground text-xs leading-relaxed">{t("compliance")}</p>
			<div className="flex flex-wrap gap-3">
				<Link
					href="/trade"
					className="text-foreground inline-flex min-h-10 items-center rounded-full border border-cyan-500/30 px-4 py-2 text-sm font-medium transition-colors hover:border-cyan-400/50 hover:bg-white/5"
				>
					{t("goTrade")}
				</Link>
				<Link
					href="/membership"
					className="text-muted-foreground hover:text-foreground inline-flex min-h-10 items-center px-2 text-sm transition-colors"
				>
					{t("upgradeLink")}
				</Link>
			</div>
		</main>
	);
}
