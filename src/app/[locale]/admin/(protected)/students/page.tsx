import { getTranslations, setRequestLocale } from "next-intl/server";

import { AdminStudentsPanel } from "@/components/admin/AdminStudentsPanel";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminStudentsPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);

	const t = await getTranslations("Admin");

	return (
		<main className="space-y-6">
			<header>
				<h1 className="text-2xl font-semibold tracking-tight">{t("studentsTitle")}</h1>
				<p className="text-muted-foreground mt-2 max-w-2xl text-sm">{t("studentsSubtitle")}</p>
			</header>
			<AdminStudentsPanel />
		</main>
	);
}
