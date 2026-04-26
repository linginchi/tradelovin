import { getTranslations, setRequestLocale } from "next-intl/server";

import { AdminReviewsPanel } from "@/components/admin/AdminReviewsPanel";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminReviewsPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);

	const t = await getTranslations("Admin");

	return (
		<main className="space-y-6">
			<header>
				<h1 className="text-2xl font-semibold tracking-tight">{t("reviewsTitle")}</h1>
				<p className="text-muted-foreground mt-2 max-w-2xl text-sm">{t("reviewsSubtitle")}</p>
			</header>
			<AdminReviewsPanel />
		</main>
	);
}
