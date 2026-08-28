"use client";

import { ArrowUpRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth/use-auth";
import { useMembershipCurrent } from "@/lib/membership/client";
import { resolveHomeUpgradeCta } from "@/lib/membership/home-upgrade-cta";
import { getDisplayLevel, getLocalizedLevelLabel } from "@/lib/membership/level-mapping";
import { cn } from "@/lib/utils";

export function HomeUpgradeCta() {
	const t = useTranslations("Home");
	const locale = useLocale();
	const { isAuthed } = useAuth();
	const { membership } = useMembershipCurrent(isAuthed);
	const cta = resolveHomeUpgradeCta({
		isAuthed,
		plan: membership?.plan ?? null,
	});

	if (!cta.visible) return null;

	const label = cta.nextPlan
		? t("upgradeCtaTo", {
				level: getLocalizedLevelLabel(getDisplayLevel(cta.nextPlan), locale),
			})
		: t("upgradeCta");

	return (
		<Link
			href={cta.href}
			className={cn(
				"inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-semibold tracking-tight text-cyan-100 shadow-sm backdrop-blur-md transition-all outline-none",
				"hover:border-cyan-400/60 hover:bg-cyan-500/20 hover:shadow-[0_0_0_1px_oklch(0.72_0.12_195/0.25)]",
				"focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
				"sm:w-auto sm:shrink-0",
			)}
		>
			{label}
			<ArrowUpRight className="size-4 shrink-0" aria-hidden />
		</Link>
	);
}
