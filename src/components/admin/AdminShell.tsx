"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
	BookOpen,
	Briefcase,
	ClipboardList,
	LayoutDashboard,
	LogOut,
	Mail,
	Menu,
	Shield,
	Sparkles,
	UserCircle,
	UserPlus,
	UserRoundPlus,
	Users,
} from "lucide-react";

import { ADMIN_BASE_PATH } from "@/lib/admin/paths";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import type { AdminRole } from "@/lib/auth/admin-jwt";
import { cn } from "@/lib/utils";

type Props = {
	role: AdminRole;
	email: string;
	children: React.ReactNode;
};

export function AdminShell({ role, email, children }: Props) {
	const pathname = usePathname();
	const router = useRouter();
	const t = useTranslations("Admin");
	const [mobileOpen, setMobileOpen] = useState(false);

	const items: { href: string; label: string; icon: typeof LayoutDashboard }[] = [
		{ href: ADMIN_BASE_PATH, label: t("navDashboard"), icon: LayoutDashboard },
	];

	if (role === "super_admin") {
		items.push({
			href: `${ADMIN_BASE_PATH}/course-teaser`,
			label: t("navCourseTeaser"),
			icon: Sparkles,
		});
	}

	items.push(
		{ href: `${ADMIN_BASE_PATH}/reviews`, label: t("navReviews"), icon: ClipboardList },
		{ href: `${ADMIN_BASE_PATH}/students`, label: t("navStudents"), icon: Users },
		{ href: `${ADMIN_BASE_PATH}/courses`, label: t("navCourses"), icon: BookOpen },
		{ href: `${ADMIN_BASE_PATH}/course-registrations`, label: t("navCourseRegs"), icon: UserPlus },
		{ href: `${ADMIN_BASE_PATH}/job-applications`, label: t("navJobApps"), icon: Briefcase },
		{ href: `${ADMIN_BASE_PATH}/instructors`, label: t("navInstructors"), icon: UserCircle },
		{ href: `${ADMIN_BASE_PATH}/fees`, label: t("navFees"), icon: Mail },
	);

	if (role === "super_admin") {
		items.push({ href: `${ADMIN_BASE_PATH}/add-user`, label: t("navAddUser"), icon: UserRoundPlus });
		items.push({ href: `${ADMIN_BASE_PATH}/admins`, label: t("navAdmins"), icon: Shield });
	}

	async function logout() {
		await fetch("/api/admin/auth/logout", { method: "POST" });
		router.replace(`${ADMIN_BASE_PATH}/login`);
	}

	function NavLink({
		href,
		label,
		icon: Icon,
		onNavigate,
		mobile,
	}: {
		href: string;
		label: string;
		icon: typeof LayoutDashboard;
		onNavigate?: () => void;
		mobile?: boolean;
	}) {
		const active =
			href === ADMIN_BASE_PATH
				? pathname === href
				: pathname === href || pathname.startsWith(`${href}/`);
		return (
			<Link
				href={href}
				onClick={onNavigate}
				className={cn(
					"flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
					mobile ? "py-3" : "",
					active
						? "bg-cyan-500/15 text-cyan-200 shadow-[inset_0_0_0_1px_oklch(0.72_0.12_195/0.25)]"
						: "text-muted-foreground hover:bg-white/5 hover:text-foreground",
				)}
			>
				<Icon className="size-4 shrink-0 opacity-80" aria-hidden />
				{label}
			</Link>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col md:flex-row">
			<aside
				className={cn(
					"border-border/60 bg-background/95 supports-[backdrop-filter]:bg-background/80 hidden w-56 shrink-0 flex-col border-r backdrop-blur-md md:sticky md:top-0 md:flex md:h-[calc(100dvh)]",
				)}
			>
				<div className="border-border/60 border-b px-4 py-4">
					<p className="font-heading text-foreground text-sm font-semibold tracking-tight">{t("title")}</p>
					<p className="text-muted-foreground mt-0.5 truncate text-xs">{email}</p>
				</div>
				<nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label={t("navMenu")}>
					{items.map((item) => (
						<NavLink key={item.href} {...item} />
					))}
				</nav>
				<div className="border-border/60 mt-auto border-t p-3">
					<Button type="button" variant="outline" size="sm" className="w-full" onClick={() => void logout()}>
						<LogOut className="mr-2 size-4" aria-hidden />
						{t("logout")}
					</Button>
				</div>
			</aside>

			<div className="flex min-w-0 flex-1 flex-col">
				<header className="border-border/60 bg-background/90 sticky top-0 z-20 flex items-center justify-between gap-3 border-b px-4 py-3 backdrop-blur-md md:hidden">
					<Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
						<SheetTrigger
							render={
								<Button type="button" variant="outline" size="icon-sm" aria-label={t("navMenu")} />
							}
						>
							<Menu className="size-4" aria-hidden />
						</SheetTrigger>
						<SheetContent side="left" className="w-[min(100vw-2rem,280px)] gap-0 p-0">
							<SheetHeader className="border-border/60 border-b p-4 text-left">
								<SheetTitle className="font-heading">{t("navMenu")}</SheetTitle>
								<p className="text-muted-foreground truncate text-xs font-normal">{email}</p>
							</SheetHeader>
							<nav className="flex flex-col gap-1 p-3" aria-label={t("navMenu")}>
								{items.map((item) => (
									<NavLink
										key={item.href}
										{...item}
										mobile
										onNavigate={() => setMobileOpen(false)}
									/>
								))}
							</nav>
							<div className="border-border/60 mt-auto border-t p-3">
								<Button type="button" variant="outline" size="sm" className="w-full" onClick={() => void logout()}>
									<LogOut className="mr-2 size-4" aria-hidden />
									{t("logout")}
								</Button>
							</div>
						</SheetContent>
					</Sheet>
					<span className="text-muted-foreground truncate text-xs">{t("title")}</span>
					<span className="w-10" aria-hidden />
				</header>

				<div className="relative flex-1">{children}</div>
			</div>
		</div>
	);
}
