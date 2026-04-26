import { LayoutDashboard } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminDashboardPage({ params }: Props) {
	const { locale } = await params;
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
						<Link href="/admin/students" className={cn(buttonVariants({ size: "sm" }))}>
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
			</div>
		</main>
	);
}
