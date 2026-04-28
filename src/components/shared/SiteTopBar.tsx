"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { Link } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Props = {
	className?: string;
};

type AuthGate = "loading" | "in" | "out";

/** 顶栏导航：「报名课程」需登录可见；「求职」需已有报名记录（含注册时写入的记录）可见 */
export function SiteTopBar({ className }: Props) {
	const tHome = useTranslations("Home");
	const tNav = useTranslations("Nav");

	const [auth, setAuth] = useState<AuthGate>("loading");
	const [hasEnrollment, setHasEnrollment] = useState(false);

	useEffect(() => {
		const sb = getSupabaseBrowserClient();
		if (!sb) {
			setAuth("out");
			return;
		}
		let cancelled = false;
		void (async () => {
			const {
				data: { session },
			} = await sb.auth.getSession();
			if (cancelled) return;
			if (!session) {
				setAuth("out");
				return;
			}
			setAuth("in");
			const { data } = await sb
				.from("registrations")
				.select("id")
				.eq("user_id", session.user.id)
				.maybeSingle();
			if (!cancelled) setHasEnrollment(!!data);
		})();
		return () => {
			cancelled = true;
		};
	}, []);

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
				<nav
					className="text-muted-foreground flex max-w-[42%] min-w-0 shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[10px] font-medium tracking-tight sm:max-w-none sm:gap-3 sm:text-xs md:text-sm"
					aria-label={tNav("mainLabel")}
				>
					{auth === "in" && (
						<Link href="/enroll" className="hover:text-foreground truncate transition-colors">
							{tNav("enrollCourses")}
						</Link>
					)}
					{auth === "in" && hasEnrollment && (
						<Link href="/career" className="hover:text-foreground truncate transition-colors">
							{tNav("career")}
						</Link>
					)}
				</nav>
				<div className="shrink-0">
					<LanguageSwitcher variant="bar" />
				</div>
			</div>
		</header>
	);
}
