import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";

import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getAdminSession } from "@/lib/auth/admin-session";
import { redirect } from "@/i18n/navigation";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminLoginPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);

	const session = await getAdminSession();
	if (session) {
		redirect({ href: "/admin", locale });
	}

	return (
		<div className="relative flex min-h-full flex-1 flex-col">
			<div className="absolute right-4 top-4 z-20 md:right-8 md:top-6">
				<LanguageSwitcher variant="compact" />
			</div>
			<div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
				<Suspense
					fallback={<p className="text-muted-foreground text-sm">…</p>}
				>
					<AdminLoginForm />
				</Suspense>
			</div>
		</div>
	);
}
