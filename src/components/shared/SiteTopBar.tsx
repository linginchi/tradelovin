"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Props = {
	className?: string;
};

type AuthGate = "loading" | "in" | "out";

type MeApi = {
	success?: boolean;
	loggedIn?: boolean;
	nickname?: string | null;
	hasEnrollment?: boolean;
};

/** 顶栏导航：「报名课程」需登录可见；「求职」需已有报名记录（含注册时写入的记录）可见 */
export function SiteTopBar({ className }: Props) {
	const tHome = useTranslations("Home");
	const tNav = useTranslations("Nav");
	const router = useRouter();
	const pathname = usePathname();

	const [auth, setAuth] = useState<AuthGate>("loading");
	const [nickname, setNickname] = useState("");
	const [hasEnrollment, setHasEnrollment] = useState(false);
	const [busyLogout, setBusyLogout] = useState(false);

	const refreshMe = useCallback(async () => {
		const res = await fetch("/api/auth/me", {
			method: "GET",
			credentials: "include",
			cache: "no-store",
		});
		const js = (await res.json()) as MeApi;
		if (!res.ok || !js.success) {
			return { auth: "out" as const, nickname: "", hasEnrollment: false };
		}
		if (!js.loggedIn) {
			return { auth: "out" as const, nickname: "", hasEnrollment: false };
		}
		return {
			auth: "in" as const,
			nickname: (typeof js.nickname === "string" && js.nickname.trim()) || "",
			hasEnrollment: !!js.hasEnrollment,
		};
	}, []);

	useEffect(() => {
		let cancelled = false;

		const applyState = (next: { auth: AuthGate; nickname: string; hasEnrollment: boolean }) => {
			setTimeout(() => {
				if (cancelled) return;
				setAuth(next.auth);
				setNickname(next.nickname);
				setHasEnrollment(next.hasEnrollment);
			}, 0);
		};

		void (async () => {
			try {
				const next = await refreshMe();
				applyState(next);
			} catch {
				applyState({ auth: "out", nickname: "", hasEnrollment: false });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [refreshMe, pathname]);

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
			setTimeout(() => {
				setAuth("out");
				setNickname("");
				setHasEnrollment(false);
			}, 0);
			router.replace("/login");
			router.refresh();
		}
	}, [busyLogout, router]);

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
						<span className="text-foreground/90 max-w-[8rem] truncate">{nickname || tNav("userFallback")}</span>
					)}
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
					{auth === "in" && (
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
