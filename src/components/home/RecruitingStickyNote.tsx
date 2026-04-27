"use client";

import { StickyNote } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type RecruitingRow = {
	title: string;
	description: string | null;
	start_date: string | null;
	enrollment_url: string;
};

export function RecruitingStickyNote() {
	const t = useTranslations("Home");
	const [row, setRow] = useState<RecruitingRow | null | undefined>(undefined);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		let alive = true;
		(async () => {
			try {
				const res = await fetch("/api/recruiting");
				const data = (await res.json()) as { recruiting: RecruitingRow | null };
				if (!alive) return;
				if (!res.ok) {
					setFailed(true);
					setRow(null);
					return;
				}
				setRow(data.recruiting ?? null);
			} catch {
				if (alive) {
					setFailed(true);
					setRow(null);
				}
			}
		})();
		return () => {
			alive = false;
		};
	}, []);

	if (row === undefined && !failed) {
		return (
			<div
				className="border-border/40 bg-yellow-100/8 dark:bg-yellow-900/25 h-28 w-full max-w-2xl animate-pulse rounded-sm border shadow-md"
				aria-hidden
			/>
		);
	}

	if (row == null || failed) {
		return (
			<div
				className={cn(
					"border-border/50 bg-yellow-100/15 text-muted-foreground dark:bg-yellow-900/35 w-full max-w-2xl rotate-[0.5deg] rounded-sm border px-5 py-4 text-sm shadow-md",
				)}
			>
				<p className="flex items-center gap-2 text-xs font-medium text-yellow-900/90 dark:text-yellow-100/85">
					<StickyNote className="size-4 shrink-0" aria-hidden />
					{t("recruitingPlaceholder")}
				</p>
			</div>
		);
	}

	const isAbsolute = /^https?:\/\//i.test(row.enrollment_url.trim());

	return (
		<div
			className={cn(
				"border-border/40 bg-yellow-100/20 text-foreground shadow-[2px_3px_0_0_oklch(0.25_0.02_90/0.35)] dark:bg-yellow-900/35 dark:shadow-[2px_3px_0_0_oklch(0.15_0.02_90/0.5)]",
				"w-full max-w-2xl rotate-[0.8deg] rounded-sm border px-5 py-4 md:px-6 md:py-5",
			)}
		>
			<p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-yellow-950/90 uppercase dark:text-yellow-50/90">
				<StickyNote className="size-4 shrink-0" aria-hidden />
				{t("recruitingKicker")}
			</p>
			<h2 className="mt-2 text-lg font-semibold tracking-tight text-yellow-950 dark:text-yellow-50">
				{row.title}
			</h2>
			{row.start_date && (
				<p className="text-yellow-950/75 dark:text-yellow-100/80 mt-1 font-mono text-xs tabular-nums">
					{t("recruitingDateLabel")}: {row.start_date}
				</p>
			)}
			{row.description && (
				<p className="text-yellow-950/85 dark:text-yellow-50/85 mt-3 text-sm leading-relaxed">
					{row.description}
				</p>
			)}
			<div className="mt-4">
				{isAbsolute ? (
					<a
						href={row.enrollment_url}
						rel="noopener noreferrer"
						className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
					>
						{t("recruitingCta")}
					</a>
				) : (
					<Link
						href={row.enrollment_url.startsWith("/") ? row.enrollment_url : `/${row.enrollment_url}`}
						className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
					>
						{t("recruitingCta")}
					</Link>
				)}
			</div>
		</div>
	);
}
