import { getTranslations, setRequestLocale } from "next-intl/server";

import { AdminLabConfigPanel } from "@/components/admin/AdminLabConfigPanel";
import { routing } from "@/i18n/routing";

const locale = routing.defaultLocale;

export default async function AdminLabPage() {
	setRequestLocale(locale);
	const t = await getTranslations("Admin");
	return (
		<main className="space-y-4">
			<header>
				<h1 className="text-2xl font-semibold tracking-tight">AI量化实验室</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					切换新建诊断所用的多模态模型（默认火山）。Spike 锁定 model id 前不可选。
				</p>
				<p className="text-muted-foreground mt-1 text-xs">{t("envHint")}</p>
			</header>
			<AdminLabConfigPanel />
		</main>
	);
}
