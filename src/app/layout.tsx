import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";

import { htmlLangFromPathname, INVOKE_PATH_HEADER } from "@/lib/invoke-path-header";

import "./globals.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

type Props = {
	children: ReactNode;
};

export default async function RootLayout({ children }: Props) {
	const h = await headers();
	const pathname = h.get(INVOKE_PATH_HEADER) ?? "";
	const lang = htmlLangFromPathname(pathname);

	return (
		<html
			lang={lang}
			className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
			suppressHydrationWarning
		>
			<body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
		</html>
	);
}
