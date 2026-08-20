"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { CoachBadge } from "@/components/coach/CoachBadge";
import { useAuth } from "@/lib/auth/use-auth";
import { useMembershipLevel } from "@/lib/membership/client";

export function ProfileMembershipLevelCard() {
	const locale = useLocale();
	const t = useTranslations("membership.level");
	const { status } = useAuth();
	const isAuthed = status === "authenticated";
	const { level } = useMembershipLevel(locale, isAuthed);
	const [isCoach, setIsCoach] = useState(false);

	useEffect(() => {
		if (!isAuthed) {
			setIsCoach(false);
			return;
		}
		let cancelled = false;
		void fetch("/api/coach/me", { credentials: "include" })
			.then(async (res) => {
				const json = (await res.json()) as { data?: { isCoach?: boolean } };
				if (!cancelled) setIsCoach(Boolean(json.data?.isCoach));
			})
			.catch(() => {
				if (!cancelled) setIsCoach(false);
			});
		return () => {
			cancelled = true;
		};
	}, [isAuthed]);

	return (
		<section className="border-border/80 bg-card/35 mb-6 rounded-2xl border p-6 backdrop-blur-md md:p-8">
			<h2 className="text-base font-semibold tracking-tight">{t("title")}</h2>
			<p className="text-muted-foreground mt-2 text-sm">{t("currentLevel")}</p>
			<p className="mt-1 text-lg font-semibold">{level.label}</p>
			<p className="text-muted-foreground mt-1 text-sm">{level.description}</p>
			{isCoach ? (
				<div className="mt-3">
					<CoachBadge />
				</div>
			) : null}
		</section>
	);
}
