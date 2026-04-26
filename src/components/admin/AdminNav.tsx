"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
	BookOpen,
	ClipboardList,
	LayoutDashboard,
	LogOut,
	Mail,
	Menu,
	Shield,
	UserCircle,
	Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { AdminRole } from "@/lib/auth/admin-jwt";
import { cn } from "@/lib/utils";

type Props = {
	role: AdminRole;
	email: string;
};

export function AdminNav({ role, email }: Props) {
	const pathname = usePathname();
	const router = useRouter();
	const t = useTranslations("Admin");
	const [mobileOpen, setMobileOpen] = useState(false);

	const items: { href: string; label: string; icon: typeof LayoutDashboard }[] = [
		{ href: "/admin", label: t("navDashboard"), icon: LayoutDashboard },
		{ href: "/admin/reviews", label: t("navReviews"), icon: ClipboardList },
		{ href: "/admin/students", label: t("navStudents"), icon: Users },
		{ href: "/admin/courses", label: t("navCourses"), icon: BookOpen },
		{ href: "/admin/instructors", label: t("navInstructors"), icon: UserCircle },
		{ href: "/admin/fees", label: t("navFees"), icon: Mail },
	];

	if (role === "super_admin") {
		items.push({ href: "/admin/admins", label: t("navAdmins"), icon: Shield });
	}

	async function logout() {
		await fetch("/api/admin/auth/logout", { method: "POST" });
		router.replace("/admin/login");
	}

	function NavLink({
		href,
		label,
		icon: Icon,
		onNavigate,
	}: {
		href: string;
		label: string;
		icon: typeof LayoutDashboard;
		onNavigate?: () => void;
	}) {
		const active = pathname === href || pathname.startsWith(`${href}/`);
		return (
			<Link
				href={href}
				onClick={onNavigate}
				className={cn(
					"flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
					active
						? "bg-cyan-500/15 text-cyan-200"
						: "text-muted-foreground hover:bg-white/5 hover:text-foreground",
				)}
			>
				<Icon className="size-4 shrink-0" aria-hidden />
				{label}
			</Link>
		);
	}

	return (
		<header className="border-border/60 bg-background/90 sticky top-0 z-30 border-b backdrop-blur-md">
			<div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
				<div className="flex items-center gap-2">
					<Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
						<SheetTrigger
							render={
								<Button
									type="button"
									variant="outline"
									size="icon-sm"
									className="md:hidden"
									aria-label={t("navMenu")}
								/>
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
										onNavigate={() => setMobileOpen(false)}
									/>
								))}
							</nav>
						</SheetContent>
					</Sheet>

					<div className="hidden min-w-0 flex-wrap items-center gap-1 md:flex md:gap-2">
						{items.map((item) => (
							<NavLink key={item.href} {...item} />
						))}
					</div>
				</div>

				<div className="flex items-center gap-2 md:gap-3">
					<LanguageSwitcher variant="compact" />
					<span className="text-muted-foreground hidden max-w-[200px] truncate text-xs lg:inline">
						{email}
					</span>
					<Button type="button" variant="outline" size="sm" onClick={() => void logout()}>
						<LogOut className="mr-1 size-4" aria-hidden />
						{t("logout")}
					</Button>
				</div>
			</div>
		</header>
	);
}
