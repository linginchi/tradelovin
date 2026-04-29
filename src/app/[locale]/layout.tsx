import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { LocaleMainShell } from "@/components/layout/LocaleMainShell";
import { SiteTopBar } from "@/components/shared/SiteTopBar";
import { routing } from "@/i18n/routing";

type Props = Readonly<{
	children: React.ReactNode;
	params: Promise<{ locale: string }>;
}>;

export function generateStaticParams() {
	return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(props: Omit<Props, "children">): Promise<Metadata> {
	const { locale } = await props.params;
	const t = await getTranslations({ locale, namespace: "Metadata" });

	return {
		title: t("siteTitle"),
		description: t("siteDescription"),
	};
}

export default async function LocaleLayout({ children, params }: Props) {
	const { locale } = await params;
	if (!hasLocale(routing.locales, locale)) {
		notFound();
	}

	setRequestLocale(locale);

	const messages = await getMessages();

	return (
		<NextIntlClientProvider locale={locale} messages={messages}>
			<SiteTopBar />
			<LocaleMainShell>{children}</LocaleMainShell>
		</NextIntlClientProvider>
	);
}
