import { getTranslations, setRequestLocale } from "next-intl/server";

import { CoursesListClient } from "@/components/courses/CoursesListClient";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "CoursesPage" });
	return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function CoursesPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);
	const t = await getTranslations("CoursesPage");

	return (
		<div className="relative flex min-h-full flex-1 flex-col">
			<div className="mx-auto flex w-full max-w-5xl px-4 pt-3 sm:px-6">
				<Link href="/" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}>
					{t("back")}
				</Link>
			</div>
			<div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:py-12">
				<header className="mb-8">
					<h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
					<p className="text-muted-foreground mt-2 text-sm">{t("intro")}</p>
				</header>
				<CoursesListClient />
			</div>
		</div>
	);
}
