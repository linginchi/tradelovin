import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { LocaleMainShell } from "@/components/layout/LocaleMainShell";
import { routing } from "@/i18n/routing";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

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
	const htmlLang =
		locale === "zh" ? "zh-CN" : locale === "zh-TW" ? "zh-Hant" : "en";

	return (
		<html
			lang={htmlLang}
			className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
			suppressHydrationWarning
		>
			<body className="min-h-full flex flex-col bg-background text-foreground">
				<NextIntlClientProvider messages={messages}>
					<LocaleMainShell>{children}</LocaleMainShell>
				</NextIntlClientProvider>
			</body>
		</html>
	);
}
