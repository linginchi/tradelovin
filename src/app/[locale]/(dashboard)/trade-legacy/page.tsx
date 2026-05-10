import { setRequestLocale } from "next-intl/server";

import { TradePageClient } from "@/components/trade/TradePageClient";

type Props = Readonly<{ params: Promise<{ locale: string }> }>;

export default async function TradeLegacyPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);
	return <TradePageClient />;
}
