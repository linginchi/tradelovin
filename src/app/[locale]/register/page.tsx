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

	return (
		<div className="relative flex min-h-full flex-1 flex-col">
			<div className="mx-auto flex w-full max-w-5xl px-4 pt-3 sm:px-6">
				<Link href="/" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}>
					{t("back")}
				</Link>
			</div>
			<div className="flex flex-1 flex-col items-center px-4 py-8 md:py-14">
				<RegistrationForm />
			</div>
		</div>
	);
}
