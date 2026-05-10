import { setRequestLocale } from "next-intl/server";

import ConditionalOrdersPageClient from "@/components/trade/ConditionalOrdersPageClient";

type Props = { params: Promise<{ locale: string }> };

export default async function ConditionsPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);

	return (
		<div className="mx-auto w-full max-w-6xl px-4 py-4 md:py-6">
			<h1 className="mb-1 text-xl font-semibold tracking-tight md:text-2xl">条件单中心</h1>
			<p className="mb-4 text-sm text-muted-foreground">
				创建触发条件并自动下单，支持手动触发一次全量检查。
			</p>
			<ConditionalOrdersPageClient />
		</div>
	);
}
