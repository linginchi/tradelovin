import { getTranslations, setRequestLocale } from "next-intl/server";

import { AdminCourseDetailClient } from "@/components/admin/AdminCourseDetailClient";

type Props = { params: Promise<{ locale: string; id: string }> };

export default async function AdminCourseDetailPage({ params }: Props) {
	const { locale, id } = await params;
	setRequestLocale(locale);

	const t = await getTranslations("Admin");

	return (
		<main className="space-y-4">
			<header>
				<h1 className="text-2xl font-semibold tracking-tight">{t("coursesTitle")}</h1>
			</header>
			<AdminCourseDetailClient courseId={id} />
		</main>
	);
}
