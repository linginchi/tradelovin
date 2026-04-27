import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";

import { routing } from "@/i18n/routing";

import "../globals.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

const locale = routing.defaultLocale;

export const metadata: Metadata = {
	title: "Console",
	robots: { index: false, follow: false },
};

export default async function CjkztLayout({ children }: { children: React.ReactNode }) {
	setRequestLocale(locale);
	const messages = await getMessages({ locale });

	return (
		<html
			lang="zh-CN"
			className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
			suppressHydrationWarning
		>
			<body className="min-h-full flex flex-col bg-background text-foreground">
				<NextIntlClientProvider locale={locale} messages={messages}>
					{children}
				</NextIntlClientProvider>
			</body>
		</html>
	);
}
