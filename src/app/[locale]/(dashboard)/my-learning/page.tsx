import { getTranslations, setRequestLocale } from "next-intl/server";

import MyLearningClient from "@/components/courses/MyLearningClient";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "MyLearningPage" });
	return { title: t("metaTitle") };
}

export default async function MyLearningPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);
	const t = await getTranslations("MyLearningPage");
	const tCommon = await getTranslations("Common");

	return (
		<div className="relative flex min-h-full flex-1 flex-col">
			<div
				className="pointer-events-none absolute inset-0 opacity-[0.22]"
				aria-hidden
			>
				<div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_50%_-10%,oklch(0.52_0.16_195/0.28),transparent)]" />
			</div>
			<div className="relative z-10 mx-auto flex w-full max-w-5xl px-4 pt-3 sm:px-6">
				<Link href="/" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}>
					{tCommon("backHome")}
				</Link>
			</div>
			<div className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:py-12">
				<header className="mb-8">
					<h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{t("title")}</h1>
					<p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">{t("intro")}</p>
				</header>
				<MyLearningClient />
			</div>
		</div>
	);
}
