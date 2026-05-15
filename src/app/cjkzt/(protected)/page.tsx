import { LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ADMIN_BASE_PATH } from "@/lib/admin/paths";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { routing } from "@/i18n/routing";

const locale = routing.defaultLocale;

export default async function CjkztDashboardPage() {
	setRequestLocale(locale);
	const t = await getTranslations("Admin");

	return (
		<main className="space-y-8">
			<header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-3">
					<div className="bg-primary/15 text-primary flex size-11 items-center justify-center rounded-xl">
						<LayoutDashboard className="size-6" aria-hidden />
					</div>
					<div>
						<h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
						<p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
					</div>
				</div>
				<Link href="/" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
					{t("back")}
				</Link>
			</header>

			<Card className="border-dashed border-border/60 bg-card/25">
				<CardContent className="text-muted-foreground pt-6 text-sm">{t("envHint")}</CardContent>
			</Card>

			<div className="grid gap-4 md:grid-cols-2">
				<Card className="border-border/80 bg-card/35 backdrop-blur-md">
					<CardHeader>
						<CardTitle className="text-base">{t("registrations")}</CardTitle>
						<CardDescription>{t("registrationsHint")}</CardDescription>
					</CardHeader>
					<CardContent>
						<Link
							href={`${ADMIN_BASE_PATH}/students`}
							className={cn(buttonVariants({ size: "sm" }))}
						>
							{t("navStudents")}
						</Link>
					</CardContent>
				</Card>
				<Card className="border-border/80 bg-card/35 backdrop-blur-md">
					<CardHeader>
						<CardTitle className="text-base">{t("schedules")}</CardTitle>
						<CardDescription>{t("schedulesHint")}</CardDescription>
					</CardHeader>
				</Card>
				<Card className="border-border/80 bg-card/35 backdrop-blur-md">
					<CardHeader>
						<CardTitle className="text-base">TradeQuotient 引擎</CardTitle>
						<CardDescription>管理 TQ 特征权重、维度权重并触发全量重算。</CardDescription>
					</CardHeader>
					<CardContent>
						<Link href={`${ADMIN_BASE_PATH}/tq`} className={cn(buttonVariants({ size: "sm" }))}>
							进入 TQ 评分配置
						</Link>
					</CardContent>
				</Card>
				<Card className="border-border/80 bg-card/35 backdrop-blur-md">
					<CardHeader>
						<CardTitle className="text-base">邮件配置指南</CardTitle>
						<CardDescription>查看 SPF / DKIM 设置步骤，提升邮件送达率。</CardDescription>
					</CardHeader>
					<CardContent>
						<Link href={`${ADMIN_BASE_PATH}/mail-config-guide`} className={cn(buttonVariants({ size: "sm" }))}>
							打开指南
						</Link>
					</CardContent>
				</Card>
			</div>
		</main>
	);
}
