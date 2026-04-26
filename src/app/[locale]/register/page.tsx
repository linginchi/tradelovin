import { getTranslations, setRequestLocale } from "next-intl/server";

import { RegistrationForm } from "@/components/registration-form";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Props = {
	params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props) {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Metadata" });

	return {
		title: t("registerTitle"),
		description: t("registerDescription"),
	};
}

export default async function RegisterPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);

	const t = await getTranslations("RegisterPage");
	const tCommon = await getTranslations("Common");

	return (
		<div className="relative flex min-h-full flex-1 flex-col">
			<div className="border-border/60 bg-background/80 supports-backdrop-filter:bg-background/60 sticky top-0 z-10 border-b backdrop-blur-md">
				<div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
					<Link
						href="/"
						className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
					>
						{t("back")}
					</Link>
					<span className="text-muted-foreground text-sm">{tCommon("brand")}</span>
				</div>
			</div>
			<div className="flex flex-1 flex-col items-center px-4 py-10 md:py-16">
				<RegistrationForm />
			</div>
		</div>
	);
}
