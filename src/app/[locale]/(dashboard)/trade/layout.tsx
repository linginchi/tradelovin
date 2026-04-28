import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getTranslations } from "next-intl/server";

export async function generateMetadata(props: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { params } = props;
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Trade" });
	const tBrand = await getTranslations({ locale, namespace: "Common" });
	return {
		title: `${t("title")} · ${tBrand("brand")}`,
		description: t("subtitle"),
	};
}

export default function TradeLayout({ children }: { children: ReactNode }) {
	return children;
}
