import { getTranslations, setRequestLocale } from "next-intl/server";

import { CourseDetailClient } from "@/components/courses/CourseDetailClient";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props) {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "CourseDetailPage" });
	return { title: t("metaTitle") };
}

export default async function CourseDetailPage({ params }: Props) {
	const { locale, id } = await params;
	setRequestLocale(locale);
	const tc = await getTranslations("CoursesPage");

	return (
		<div className="relative flex min-h-full flex-1 flex-col">
			<div className="mx-auto flex w-full max-w-5xl px-4 pt-3 sm:px-6">
				<Link href="/courses" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}>
					{tc("back")}
				</Link>
			</div>
			<div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:py-12">
				<CourseDetailClient courseId={id} />
			</div>
		</div>
	);
}
