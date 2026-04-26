import { setRequestLocale } from "next-intl/server";

import { AdminShell } from "@/components/admin/AdminShell";
import { getAdminSession } from "@/lib/auth/admin-session";
import { redirect } from "@/i18n/navigation";

type Props = {
	children: React.ReactNode;
	params: Promise<{ locale: string }>;
};

export default async function ProtectedAdminLayout({ children, params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);

	const session = await getAdminSession();
	if (!session || (session.role !== "admin" && session.role !== "super_admin")) {
		redirect({ href: "/admin/login", locale });
		return null;
	}

	return (
		<div className="relative flex min-h-full flex-1 flex-col">
			<div
				className="pointer-events-none absolute inset-0 opacity-[0.22]"
				aria-hidden
			>
				<div className="absolute inset-0 bg-[radial-gradient(ellipse_65%_45%_at_50%_0%,oklch(0.52_0.16_200/0.22),transparent)]" />
			</div>
			<div className="relative z-10 flex min-h-full flex-1">
				<AdminShell role={session.role} email={session.email}>
					<div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">{children}</div>
				</AdminShell>
			</div>
		</div>
	);
}
