import { getTranslations, setRequestLocale } from "next-intl/server";

import { AdminCourseRegistrationsClient } from "@/components/admin/AdminCourseRegistrationsClient";
import { routing } from "@/i18n/routing";

const locale = routing.defaultLocale;

export default async function AdminCourseRegistrationsPage() {
	setRequestLocale(locale);
	const t = await getTranslations("Admin");

	return (
		<main className="space-y-6">
			<header>
				<h1 className="text-2xl font-semibold tracking-tight">{t("courseRegsTitle")}</h1>
				<p className="text-muted-foreground mt-1 text-sm">{t("courseRegsSubtitle")}</p>
			</header>
			<AdminCourseRegistrationsClient />
		</main>
	);
}
