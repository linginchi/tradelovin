"use client";

import { useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Props = {
	className?: string;
};

/** 全站顶栏：品牌标题（Home.badge，随语言切换）+ 右上角语言切换 */
export function SiteTopBar({ className }: Props) {
	const tHome = useTranslations("Home");

	return (
		<header
			className={cn(
				"sticky top-0 z-40 border-b border-cyan-500/20 bg-background/90 shadow-[0_1px_0_0_oklch(0.55_0.18_195/0.12)] backdrop-blur-md",
				"supports-[backdrop-filter]:bg-background/75",
				className,
			)}
		>
			<div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6 sm:py-3">
				<Link
					href="/"
					className="text-foreground hover:text-cyan-200/95 min-w-0 flex-1 truncate text-left text-sm font-semibold leading-snug tracking-tight transition-colors sm:text-base"
				>
					{tHome("badge")}
				</Link>
				<div className="shrink-0">
					<LanguageSwitcher variant="bar" />
				</div>
			</div>
		</header>
	);
}
