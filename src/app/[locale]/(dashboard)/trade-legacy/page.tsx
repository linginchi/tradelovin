import { setRequestLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

type Props = Readonly<{ params: Promise<{ locale: string }> }>;

export default async function TradeLegacyPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);
	redirect({ href: "/trade", locale });
}
