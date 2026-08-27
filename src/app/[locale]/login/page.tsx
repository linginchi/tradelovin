import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { EmailLinkLoginForm } from "@/components/auth/EmailLinkLoginForm";
import { LocalDevLoginNotice } from "@/components/auth/LocalDevLoginNotice";
import { PasskeyLoginButton } from "@/components/auth/PasskeyLoginButton";
import { PasswordLoginForm } from "@/components/auth/PasswordLoginForm";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "@/i18n/navigation";
import { isLocalDevAuthHost } from "@/lib/auth/passkey";
import { cn } from "@/lib/utils";

type Props = {
	params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props) {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "MagicLogin" });

	return {
		title: t("metaTitle"),
		description: t("metaDescription"),
	};
}

export default async function LoginPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);

	const tNav = await getTranslations("RegisterPage");
	const t = await getTranslations("MagicLogin");
	const host = (await headers()).get("host") ?? "";
	const localDev = isLocalDevAuthHost(host);

	return (
		<div className="relative flex min-h-full flex-1 flex-col">
			<div className="mx-auto flex w-full max-w-5xl px-4 pt-3 sm:px-6">
				<Link href="/" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}>
					{tNav("back")}
				</Link>
			</div>
			<div className="flex flex-1 flex-col items-center px-4 py-8 md:py-14">
				<div className="border-border/80 bg-card/40 mx-auto w-full max-w-lg space-y-6 rounded-xl border p-6 shadow-sm backdrop-blur-sm md:p-8">
					<div className="space-y-1">
						<h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
						<p className="text-muted-foreground text-sm">{t("intro")}</p>
					</div>
					<LocalDevLoginNotice />
					<PasskeyLoginButton />
					<Tabs defaultValue={localDev ? "password" : "email-link"} className="w-full">
						<TabsList className="grid w-full grid-cols-2">
							<TabsTrigger value="email-link">{t("emailLinkTab")}</TabsTrigger>
							<TabsTrigger value="password">{t("passwordTab")}</TabsTrigger>
						</TabsList>
						<TabsContent value="email-link">
							<EmailLinkLoginForm />
						</TabsContent>
						<TabsContent value="password">
							<PasswordLoginForm />
						</TabsContent>
					</Tabs>
				</div>
			</div>
		</div>
	);
}
