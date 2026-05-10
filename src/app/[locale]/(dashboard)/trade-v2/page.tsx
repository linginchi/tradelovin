import { setRequestLocale } from "next-intl/server";

import { TradeV2PageClient } from "@/components/trade/TradeV2PageClient";

type Props = Readonly<{ params: Promise<{ locale: string }> }>;

export default async function TradeV2Page({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);
	return <TradeV2PageClient />;
}
