"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth/use-auth";
import { useMembershipCurrent } from "@/lib/membership/client";
import { getLevelByPlan, getLocalizedLevelName } from "@/lib/membership/level-mapping";
import { cn } from "@/lib/utils";

type Props = {
	className?: string;
};

/** 顶栏导航：「报名课程」需登录可见；「求职」需已有报名记录（含注册时写入的记录）可见 */
export function SiteTopBar({ className }: Props) {
	const tHome = useTranslations("Home");
	const tNav = useTranslations("Nav");
	const tMembership = useTranslations("membership");
	const locale = useLocale();
	const router = useRouter();
	const pathname = usePathname();
	const { status, user, refresh } = useAuth();

	const [busyLogout, setBusyLogout] = useState(false);
	const isAuthed = status === "authenticated";
	const nickname = user?.nickname ?? "";
	const hasEnrollment = !!user?.hasEnrollment;
	const { membership, expired: membershipExpired } = useMembershipCurrent(isAuthed);
	const levelLabel = (() => {
		if (!membership) return "";
		const level = getLevelByPlan(membership.plan);
		return `${level.code} ${getLocalizedLevelName(level, locale)}`;
	})();

	const onLogout = useCallback(async () => {
		if (busyLogout) return;
		setBusyLogout(true);
		try {
			await fetch("/api/auth/logout", {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
			});
		} finally {
			setBusyLogout(false);
			await refresh();
			router.replace("/login");
			router.refresh();
		}
	}, [busyLogout, refresh, router]);

	useEffect(() => {
		void refresh();
	}, [pathname, refresh]);

	return (
		<header
			className={cn(
				"sticky top-0 z-40 border-b border-cyan-500/20 bg-background/90 shadow-[0_1px_0_0_oklch(0.55_0.18_195/0.12)] backdrop-blur-md",
				"supports-[backdrop-filter]:bg-background/75",
				className,
			)}
		>
			{membershipExpired ? (
				<Link
					href="/membership"
					className="block border-b border-orange-300/35 bg-orange-500/12 px-4 py-2 text-center text-sm font-medium text-orange-200 transition-colors hover:bg-orange-500/20 sm:px-6"
				>
					{tMembership("expiredBanner")}
				</Link>
			) : null}
			<div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6 sm:py-3">
				<Link
					href="/"
					className="text-foreground hover:text-cyan-200/95 min-w-0 flex-1 truncate text-left text-sm font-semibold leading-snug tracking-tight transition-colors sm:text-base"
				>
					{tHome("badge")}
				</Link>
				<nav
					className="text-muted-foreground flex max-w-[42%] min-w-0 shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[10px] font-medium tracking-tight sm:max-w-none sm:gap-3 sm:text-xs md:text-sm"
					aria-label={tNav("mainLabel")}
				>
					{isAuthed && (
						<span className="text-foreground/90 max-w-[10rem] truncate">
							{nickname || tNav("userFallback")}
							{levelLabel ? ` · ${levelLabel}` : ""}
						</span>
					)}
					{isAuthed && (
						<Link href="/courses" className="hover:text-foreground truncate transition-colors">
							{tNav("enrollCourses")}
						</Link>
					)}
					{isAuthed && hasEnrollment && (
						<Link href="/career" className="hover:text-foreground truncate transition-colors">
							{tNav("career")}
						</Link>
					)}
					{isAuthed && (
						<button
							type="button"
							onClick={() => {
								void onLogout();
							}}
							disabled={busyLogout}
							className="hover:text-foreground disabled:text-muted-foreground truncate transition-colors disabled:cursor-not-allowed"
						>
							{busyLogout ? tNav("loggingOut") : tNav("logout")}
						</button>
					)}
				</nav>
				<div className="shrink-0">
					<LanguageSwitcher variant="bar" />
				</div>
			</div>
		</header>
	);
}
