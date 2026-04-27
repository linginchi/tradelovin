import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { getAdminSession } from "@/lib/auth/admin-session";
import { routing } from "@/i18n/routing";

const locale = routing.defaultLocale;

export default async function CjkztLoginPage() {
	setRequestLocale(locale);

	const session = await getAdminSession();
	if (session) {
		redirect("/cjkzt");
	}

	return (
		<div className="relative flex min-h-full flex-1 flex-col">
			<div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
				<Suspense fallback={<p className="text-muted-foreground text-sm">…</p>}>
					<AdminLoginForm />
				</Suspense>
			</div>
		</div>
	);
}
