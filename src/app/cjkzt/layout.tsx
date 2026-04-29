import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";

import { routing } from "@/i18n/routing";

const locale = routing.defaultLocale;

export const metadata: Metadata = {
	title: "Console",
	robots: { index: false, follow: false },
};

export default async function CjkztLayout({ children }: { children: React.ReactNode }) {
	setRequestLocale(locale);
	const messages = await getMessages({ locale });

	return (
		<NextIntlClientProvider locale={locale} messages={messages}>
			{children}
		</NextIntlClientProvider>
	);
}
