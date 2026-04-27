"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export function UpcomingCourseTeaser() {
	const t = useTranslations("Home");
	const [text, setText] = useState<string | undefined>(undefined);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		let alive = true;
		const fallback = t("teaserFallback");
		(async () => {
			try {
				const res = await fetch("/api/course-teaser", { credentials: "same-origin" });
				const raw = (await res.json()) as { content?: string; error?: string };
				if (!alive) return;
				if (!res.ok) {
					setFailed(true);
					setText(fallback);
					return;
				}
				const c = typeof raw.content === "string" ? raw.content.trim() : "";
				setText(c || fallback);
			} catch {
				if (alive) {
					setFailed(true);
					setText(fallback);
				}
			}
		})();
		return () => {
			alive = false;
		};
	}, [t]);

	if (text === undefined && !failed) {
		return (
			<div
				className="border-border/40 bg-yellow-100/8 dark:bg-yellow-900/25 h-24 w-full max-w-2xl animate-pulse rounded-sm border shadow-md"
				aria-hidden
			/>
		);
	}

	const display = text ?? t("teaserFallback");

	return (
		<div
			className={cn(
				"border-border/40 bg-yellow-100/20 text-foreground shadow-[2px_3px_0_0_oklch(0.25_0.02_90/0.35)] dark:bg-yellow-900/35 dark:shadow-[2px_3px_0_0_oklch(0.15_0.02_90/0.5)]",
				"w-full max-w-2xl rotate-[0.6deg] rounded-sm border px-5 py-4 md:px-6 md:py-5",
			)}
		>
			<p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-yellow-950/90 uppercase dark:text-yellow-50/90">
				<Sparkles className="size-4 shrink-0" aria-hidden />
				{t("teaserKicker")}
			</p>
			<p className="text-yellow-950/90 dark:text-yellow-50/90 mt-3 text-sm leading-relaxed whitespace-pre-wrap">
				{display}
			</p>
		</div>
	);
}
