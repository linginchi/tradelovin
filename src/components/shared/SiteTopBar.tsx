"use client";

import { Menu } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { NavDropdown } from "@/components/shared/NavDropdown";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth/use-auth";
import { useMembershipCurrent } from "@/lib/membership/client";
import { getDisplayLevel, getLocalizedLevelName } from "@/lib/membership/level-mapping";
import { cn } from "@/lib/utils";

type Props = {
	className?: string;
};

/** 顶栏导航：支持/社区/独立交易员为下拉占位（待建中）；登录后显示「我的+会员等级+退出」 */
export function SiteTopBar({ className }: Props) {
	const tHome = useTranslations("Home");
	const tNav = useTranslations("Nav");
	const tMembership = useTranslations("membership");
	const locale = useLocale();
	const router = useRouter();
	const pathname = usePathname();
	const { status, user, refresh } = useAuth();

	const [busyLogout, setBusyLogout] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const isAuthed = status === "authenticated";
	const nickname = user?.nickname ?? "";
	const hasEnrollment = !!user?.hasEnrollment;
	const { membership, expired: membershipExpired } = useMembershipCurrent(isAuthed);
	const levelLabel = (() => {
		if (!membership) return "";
		const level = getDisplayLevel(membership.plan);
		return `${level.code} ${getLocalizedLevelName(level, locale)}`;
	})();

	const comingSoon = tNav("comingSoon");
	const dropdowns = [
		{ key: "independentTrader", label: tNav("independentTrader") },
		{ key: "community", label: tNav("community") },
		{ key: "support", label: tNav("support") },
	] as const;

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
			setMenuOpen(false);
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
			<div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6 sm:py-3">
				<Link
					href="/"
					className="text-foreground hover:text-cyan-200/95 min-w-0 flex-1 truncate text-left text-sm font-semibold leading-snug tracking-tight transition-colors sm:text-base"
				>
					{tHome("badge")}
				</Link>

				{/* Desktop nav */}
				<nav
					className="hidden items-center gap-3 text-xs font-medium tracking-tight md:flex md:text-sm"
					aria-label={tNav("mainLabel")}
				>
					{dropdowns.map((d) => (
						<NavDropdown key={d.key} label={d.label} comingSoonLabel={comingSoon} />
					))}

					<span className="bg-border/60 h-4 w-px" aria-hidden />

					{isAuthed ? (
						<>
							<Link
								href="/courses"
								className="text-muted-foreground hover:text-foreground transition-colors"
							>
								{tNav("enrollCourses")}
							</Link>
							{hasEnrollment && (
								<Link
									href="/career"
									className="text-muted-foreground hover:text-foreground transition-colors"
								>
									{tNav("career")}
								</Link>
							)}
							<Link
								href="/my-profile"
								className="text-foreground hover:text-cyan-200/95 max-w-[12rem] truncate transition-colors"
							>
								{nickname || tNav("userFallback")}
								{levelLabel ? ` · ${levelLabel}` : ""}
							</Link>
							<button
								type="button"
								onClick={() => void onLogout()}
								disabled={busyLogout}
								className="text-muted-foreground hover:text-foreground transition-colors disabled:cursor-not-allowed"
							>
								{busyLogout ? tNav("loggingOut") : tNav("logout")}
							</button>
						</>
					) : (
						<>
							<Link
								href="/login"
								className="text-muted-foreground hover:text-foreground transition-colors"
							>
								{tNav("login")}
							</Link>
							<Link
								href="/register"
								className="inline-flex min-h-9 items-center rounded-full bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 px-4 py-1.5 font-semibold text-white shadow-[0_8px_20px_-10px_rgba(251,146,60,0.8)] transition-all hover:from-orange-500 hover:via-orange-500 hover:to-amber-500"
							>
								{tNav("register")}
							</Link>
						</>
					)}

					<LanguageSwitcher variant="bar" className="ml-1" />
				</nav>

				{/* Mobile: register CTA + hamburger */}
				<div className="flex items-center gap-2 md:hidden">
					{isAuthed && (
						<Link
							href="/my-profile"
							className="text-foreground hover:text-cyan-200/95 max-w-[8rem] truncate text-xs font-medium transition-colors"
						>
							{nickname || tNav("userFallback")}
						</Link>
					)}
					{!isAuthed && (
						<>
							<Link
								href="/login"
								className="text-muted-foreground hover:text-foreground inline-flex min-h-9 items-center px-1 text-xs font-medium transition-colors"
							>
								{tNav("login")}
							</Link>
							<Link
								href="/register"
								className="inline-flex min-h-9 items-center rounded-full bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-[0_8px_20px_-10px_rgba(251,146,60,0.8)]"
							>
								{tNav("register")}
							</Link>
						</>
					)}
					<Sheet open={menuOpen} onOpenChange={setMenuOpen}>
						<SheetTrigger
							render={
								<button
									type="button"
									aria-label={tNav("menu")}
									className="text-foreground inline-flex size-9 items-center justify-center rounded-lg border border-cyan-500/25 bg-background/80 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
								/>
							}
						>
							<Menu className="size-5" aria-hidden />
						</SheetTrigger>
						<SheetContent side="right" closeLabel={tNav("logout")} className="w-[82%] max-w-xs">
							<SheetHeader>
								<SheetTitle>{tNav("mainLabel")}</SheetTitle>
							</SheetHeader>
							<nav
								className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 pb-4"
								aria-label={tNav("mainLabel")}
							>
								{dropdowns.map((d) => (
									<div
										key={d.key}
										className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm"
									>
										<span className="text-foreground">{d.label}</span>
										<span className="text-[10px] font-medium text-amber-400/70">
											{comingSoon}
										</span>
									</div>
								))}

								<span className="bg-border/60 my-2 h-px w-full" aria-hidden />

								{isAuthed ? (
									<>
										<div className="text-muted-foreground px-3 py-1 text-xs">
											{nickname || tNav("userFallback")}
											{levelLabel ? ` · ${levelLabel}` : ""}
										</div>
										<Link
											href="/my-profile"
											onClick={() => setMenuOpen(false)}
											className="text-foreground hover:bg-white/5 rounded-lg px-3 py-2.5 text-sm transition-colors"
										>
											{tNav("myProfile")}
										</Link>
										<Link
											href="/courses"
											onClick={() => setMenuOpen(false)}
											className="text-foreground hover:bg-white/5 rounded-lg px-3 py-2.5 text-sm transition-colors"
										>
											{tNav("enrollCourses")}
										</Link>
										{hasEnrollment && (
											<Link
												href="/career"
												onClick={() => setMenuOpen(false)}
												className="text-foreground hover:bg-white/5 rounded-lg px-3 py-2.5 text-sm transition-colors"
											>
												{tNav("career")}
											</Link>
										)}
										<button
											type="button"
											onClick={() => void onLogout()}
											disabled={busyLogout}
											className="text-muted-foreground hover:bg-white/5 hover:text-foreground rounded-lg px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed"
										>
											{busyLogout ? tNav("loggingOut") : tNav("logout")}
										</button>
									</>
								) : (
									<>
										<Link
											href="/login"
											onClick={() => setMenuOpen(false)}
											className="text-foreground hover:bg-white/5 rounded-lg px-3 py-2.5 text-sm transition-colors"
										>
											{tNav("login")}
										</Link>
										<Link
											href="/register"
											onClick={() => setMenuOpen(false)}
											className="rounded-lg bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 px-3 py-2.5 text-center text-sm font-semibold text-white"
										>
											{tNav("register")}
										</Link>
									</>
								)}

								<span className="bg-border/60 my-2 h-px w-full" aria-hidden />
								<div className="px-1">
									<LanguageSwitcher />
								</div>
							</nav>
						</SheetContent>
					</Sheet>
				</div>
			</div>
		</header>
	);
}
