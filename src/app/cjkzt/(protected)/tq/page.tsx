import { getTranslations, setRequestLocale } from "next-intl/server";

import { AdminTqConfigPanel } from "@/components/admin/AdminTqConfigPanel";
import { routing } from "@/i18n/routing";

const locale = routing.defaultLocale;

export default async function AdminTqPage() {
	setRequestLocale(locale);
	const t = await getTranslations("Admin");
	return (
		<main className="space-y-4">
			<header>
				<h1 className="text-2xl font-semibold tracking-tight">TradeQuotient 评分配置</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					调整特征权重与维度权重，保存后可一键触发重算。
				</p>
				<p className="text-muted-foreground mt-1 text-xs">{t("envHint")}</p>
			</header>
			<AdminTqConfigPanel />
		</main>
	);
}
