import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { AdminRecruitingPanel } from "@/components/admin/AdminRecruitingPanel";
import { getAdminSession } from "@/lib/auth/admin-session";
import { ADMIN_BASE_PATH } from "@/lib/admin/paths";
import { routing } from "@/i18n/routing";

const locale = routing.defaultLocale;

export default async function CjkztRecruitingPage() {
	setRequestLocale(locale);

	const session = await getAdminSession();
	if (!session) {
		redirect(`${ADMIN_BASE_PATH}/login`);
	}
	if (session.role !== "super_admin") {
		redirect(ADMIN_BASE_PATH);
	}

	const t = await getTranslations("Admin");

	return (
		<main className="space-y-6">
			<header>
				<h1 className="text-2xl font-semibold tracking-tight">{t("recruitingPageTitle")}</h1>
				<p className="text-muted-foreground mt-2 max-w-2xl text-sm">{t("recruitingPageSubtitle")}</p>
			</header>
			<AdminRecruitingPanel />
		</main>
	);
}
