import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { AdminCourseTeaserPanel } from "@/components/admin/AdminCourseTeaserPanel";
import { getAdminSession } from "@/lib/auth/admin-session";
import { ADMIN_BASE_PATH } from "@/lib/admin/paths";
import { routing } from "@/i18n/routing";

const locale = routing.defaultLocale;

export default async function CjkztCourseTeaserPage() {
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
				<h1 className="text-2xl font-semibold tracking-tight">{t("courseTeaserPageTitle")}</h1>
				<p className="text-muted-foreground mt-2 max-w-2xl text-sm">{t("courseTeaserPageSubtitle")}</p>
			</header>
			<AdminCourseTeaserPanel />
		</main>
	);
}
