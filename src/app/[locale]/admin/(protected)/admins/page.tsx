import { getTranslations, setRequestLocale } from "next-intl/server";

import { AdminAdminsPanel } from "@/components/admin/AdminAdminsPanel";
import { getAdminSession } from "@/lib/auth/admin-session";
import { redirect } from "@/i18n/navigation";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminAdminsPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);

	const session = await getAdminSession();
	if (session?.role !== "super_admin") {
		redirect({ href: "/admin", locale });
	}

	const t = await getTranslations("Admin");

	return (
		<main className="space-y-6">
			<header>
				<h1 className="text-2xl font-semibold tracking-tight">{t("adminsTitle")}</h1>
				<p className="text-muted-foreground mt-2 max-w-2xl text-sm">{t("adminsSubtitle")}</p>
			</header>
			<AdminAdminsPanel />
		</main>
	);
}
