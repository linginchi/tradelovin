"use client";

import { useTranslations } from "next-intl";
import { Info, Medal, UserRound } from "lucide-react";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Link, usePathname } from "@/i18n/navigation";

const ADMIN_PREFIX = "/cjkzt";
import { cn } from "@/lib/utils";

const NAV_HREFS = ["/about", "/my-scores", "/my-profile"] as const;

export default function MobileBottomNav() {
	const pathname = usePathname();
	const t = useTranslations("Nav");

	if (pathname.includes(ADMIN_PREFIX)) {
		return null;
	}

	const items = [
		{ href: NAV_HREFS[0], label: t("about"), icon: Info },
		{ href: NAV_HREFS[1], label: t("myScores"), icon: Medal },
		{ href: NAV_HREFS[2], label: t("myProfile"), icon: UserRound },
	] as const;

	return (
		<nav
			className={cn(
				"fixed z-50 border shadow-lg backdrop-blur-xl",
				"border-cyan-500/35 bg-background/80 shadow-cyan-500/10",
				"inset-x-0 bottom-0 pb-[env(safe-area-inset-bottom)]",
				"lg:bottom-6 lg:left-1/2 lg:w-full lg:max-w-md lg:-translate-x-1/2 lg:rounded-2xl lg:px-3 lg:py-2",
			)}
			aria-label={t("mainLabel")}
		>
			<div className="mx-auto flex max-w-lg flex-col gap-1 px-2 pt-2 lg:max-w-none">
				<div className="flex justify-center lg:justify-end">
					<LanguageSwitcher variant="compact" />
				</div>
				<ul className="flex items-stretch justify-around gap-1 py-1 lg:gap-2 lg:py-1">
					{items.map(({ href, label, icon: Icon }) => {
						const active = pathname === href || pathname.startsWith(`${href}/`);
						return (
							<li key={href} className="min-w-0 flex-1">
								<Link
									href={href}
									className={cn(
										"flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2 text-xs font-medium transition-all lg:min-h-11 lg:flex-row lg:gap-2 lg:px-4",
										"outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60",
										active
											? "bg-cyan-500/15 text-cyan-300 shadow-[0_0_0_1px_oklch(0.75_0.14_195/0.45)]"
											: "text-muted-foreground hover:bg-white/5 hover:text-foreground",
									)}
								>
									<Icon
										className={cn(
											"size-6 shrink-0 lg:size-5",
											active && "text-cyan-300",
										)}
										aria-hidden
									/>
									<span className="hidden sm:inline">{label}</span>
								</Link>
							</li>
						);
					})}
				</ul>
			</div>
		</nav>
	);
}
