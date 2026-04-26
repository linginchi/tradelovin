import { ArrowLeft, Mail, Sparkles } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";

type Props = {
	params: Promise<{ locale: string }>;
};

export default async function AboutPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);

	const t = await getTranslations("About");
	const tCommon = await getTranslations("Common");
	const tHome = await getTranslations("Home");

	return (
		<main className="relative flex min-h-full flex-1 flex-col">
			<div
				className="pointer-events-none absolute inset-0 opacity-[0.3]"
				aria-hidden
			>
				<div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_50%_-15%,oklch(0.55_0.18_195/0.35),transparent)]" />
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

				<div className="border-border/80 bg-card/35 mb-8 rounded-2xl border p-6 backdrop-blur-md md:p-8">
					<p className="text-primary mb-3 inline-flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
						<Sparkles className="size-3.5" />
						{t("kicker")}
					</p>
					<h1 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">
						{t("title")}
					</h1>
					<p className="text-muted-foreground mt-4 text-sm leading-relaxed md:text-base">
						{t("p1Before")}
						<strong className="text-foreground font-medium">{t("p1Strong")}</strong>
						{t("p1After")}
					</p>
					<p className="text-muted-foreground mt-4 text-sm leading-relaxed md:text-base">
						{t("p2Before")}
						<strong className="text-foreground font-medium">{t("p2Tech")}</strong>
						{t("p2And")}
						<strong className="text-foreground font-medium">{t("p2Game")}</strong>
						{t("p2After")}
					</p>
				</div>

				<section className="border-border/80 bg-card/25 mb-6 rounded-2xl border p-6 backdrop-blur-md">
					<h2 className="text-base font-semibold tracking-tight">{t("teamTitle")}</h2>
					<p className="text-muted-foreground mt-3 text-sm leading-relaxed">{t("teamBody")}</p>
				</section>

				<section className="border-border/80 bg-card/25 rounded-2xl border p-6 backdrop-blur-md">
					<h2 className="text-base font-semibold tracking-tight">{t("contactTitle")}</h2>
					<p className="text-muted-foreground mt-3 flex flex-wrap items-center gap-2 text-sm">
						<Mail className="text-primary size-4 shrink-0" />
						<span>{t("contactPrefix")}</span>
						<a
							href="mailto:hello@tradelovin.example"
							className="text-cyan-300 underline-offset-4 hover:underline"
						>
							hello@tradelovin.example
						</a>
						<span className="text-muted-foreground">{t("contactNote")}</span>
					</p>
					<div className="mt-6">
						<Link href="/register" className={cn(buttonVariants({ size: "lg" }))}>
							{tHome("ctaRegister")}
						</Link>
					</div>
				</section>
			</div>
		</main>
	);
}
