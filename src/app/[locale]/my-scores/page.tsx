import { ArrowLeft } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import MyScoresTabsClient from "@/components/scores/MyScoresTabsClient";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ locale: string }> };

export default async function MyScoresPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);

	const t = await getTranslations("MyScores");
	const tCommon = await getTranslations("Common");

	const axes = t.raw("axes") as Array<{ key: string; value: number }>;
	const exams = t.raw("exams") as Array<{
		name: string;
		score: number;
		grade: string;
		date: string;
	}>;

	return (
		<main className="relative flex min-h-full flex-1 flex-col">
			<div
				className="pointer-events-none absolute inset-0 opacity-[0.28]"
				aria-hidden
			>
				<div className="absolute inset-0 bg-[radial-gradient(ellipse_75%_50%_at_80%_0%,oklch(0.55_0.18_195/0.3),transparent)]" />
			</div>

			<div className="absolute right-4 top-4 z-20 md:right-8 md:top-6">
				<LanguageSwitcher />
			</div>

			<div className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-6 py-10 md:py-16">
				<Link
					href="/"
					className={cn(
						buttonVariants({ variant: "ghost", size: "sm" }),
						"text-muted-foreground -ml-2 mb-8 gap-2",
					)}
				>
					<ArrowLeft className="size-4" />
					{tCommon("backHome")}
				</Link>

				<header className="mb-8">
					<h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{t("title")}</h1>
					<p className="text-muted-foreground mt-2 max-w-xl text-sm leading-relaxed">
						{t("subtitle")}
					</p>
				</header>

				<section className="border-border/80 bg-card/35 rounded-2xl border p-6 backdrop-blur-md md:p-8">
					<MyScoresTabsClient
						axes={axes}
						exams={exams}
						profileTitle={t("profileTitle")}
						profileHint={t("profileHint")}
						examTitle={t("examTitle")}
						radarLabel={t("radarLabel")}
					/>
				</section>
			</div>
		</main>
	);
}
