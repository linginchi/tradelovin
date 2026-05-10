import { setRequestLocale } from "next-intl/server";

import WatchlistPageClient from "@/components/trade/WatchlistPageClient";

type Props = { params: Promise<{ locale: string }> };

export default async function WatchlistPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);

	return (
		<div className="mx-auto w-full max-w-6xl px-4 py-4 md:py-6">
			<h1 className="mb-1 text-xl font-semibold tracking-tight md:text-2xl">监控中心</h1>
			<p className="mb-4 text-sm text-muted-foreground">
				管理价格监控，支持手动触发检查并查看触发状态。
			</p>
			<WatchlistPageClient />
		</div>
	);
}
