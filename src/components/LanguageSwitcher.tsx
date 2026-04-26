"use client";

import { useLocale, useTranslations } from "next-intl";

import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Props = {
	className?: string;
	variant?: "default" | "compact";
};

export function LanguageSwitcher({ className, variant = "default" }: Props) {
	const locale = useLocale();
	const router = useRouter();
	const pathname = usePathname();
	const t = useTranslations("LanguageSwitcher");

	const btn =
		variant === "compact"
			? "rounded-md px-2 py-1 text-[11px] font-medium"
			: "rounded-lg px-2.5 py-1.5 text-xs font-medium";

	return (
		<div
			className={cn("flex items-center gap-1", className)}
			role="group"
			aria-label={t("label")}
		>
			<button
				type="button"
				onClick={() => router.replace(pathname, { locale: "zh" })}
				className={cn(
					btn,
					"transition-colors",
					locale === "zh"
						? "bg-cyan-500/20 text-cyan-200 shadow-[0_0_0_1px_oklch(0.72_0.12_195/0.35)]"
						: "text-muted-foreground hover:bg-white/5 hover:text-foreground",
				)}
			>
				{t("zh")}
			</button>
			<span className="text-muted-foreground px-0.5 text-[10px]" aria-hidden>
				|
			</span>
			<button
				type="button"
				onClick={() => router.replace(pathname, { locale: "en" })}
				className={cn(
					btn,
					"transition-colors",
					locale === "en"
						? "bg-cyan-500/20 text-cyan-200 shadow-[0_0_0_1px_oklch(0.72_0.12_195/0.35)]"
						: "text-muted-foreground hover:bg-white/5 hover:text-foreground",
				)}
			>
				{t("en")}
			</button>
		</div>
	);
}
