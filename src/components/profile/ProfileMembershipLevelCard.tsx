"use client";

import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth/use-auth";
import { useMembershipLevel } from "@/lib/membership/client";

export function ProfileMembershipLevelCard() {
	const locale = useLocale();
	const t = useTranslations("membership.level");
	const { status } = useAuth();
	const isAuthed = status === "authenticated";
	const { level } = useMembershipLevel(locale, isAuthed);

	return (
		<section className="border-border/80 bg-card/35 mb-6 rounded-2xl border p-6 backdrop-blur-md md:p-8">
			<h2 className="text-base font-semibold tracking-tight">{t("title")}</h2>
			<p className="text-muted-foreground mt-2 text-sm">{t("currentLevel")}</p>
			<p className="mt-1 text-lg font-semibold">{level.label}</p>
			<p className="text-muted-foreground mt-1 text-sm">{level.description}</p>
		</section>
	);
}
