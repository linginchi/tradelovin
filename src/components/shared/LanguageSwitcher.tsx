"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Props = {
	className?: string;
	variant?: "default" | "compact" | "bar";
};

const sep = (
	<span className="text-muted-foreground px-0.5 text-[10px]" aria-hidden>
		|
	</span>
);

export function LanguageSwitcher({ className, variant = "default" }: Props) {
	const locale = useLocale();
	const router = useRouter();
	const pathname = usePathname();
	const t = useTranslations("LanguageSwitcher");
	const menuRef = useRef<HTMLDetailsElement>(null);

	const closeMenu = () => {
		const el = menuRef.current;
		if (el) el.open = false;
	};

	const btn =
		variant === "compact"
			? "rounded-md px-2 py-1 text-[11px] font-medium"
			: "rounded-lg px-2.5 py-1.5 text-xs font-medium";

	const barBtn = "rounded-md px-2 py-1 text-[11px] font-medium";

	const makeReplace =
		(next: "zh" | "zh-TW" | "en") => () => {
			router.replace(pathname, { locale: next });
			closeMenu();
		};

	if (variant === "bar") {
		const currentLabel = locale === "zh" ? t("zh") : locale === "zh-TW" ? t("zhTW") : t("en");

		return (
			<div className={cn("flex items-center", className)}>
				<div
					className="hidden items-center gap-1 sm:flex"
					role="group"
					aria-label={t("label")}
				>
					<button
						type="button"
						onClick={makeReplace("zh")}
						className={cn(
							"transition-colors",
							barBtn,
							locale === "zh"
								? "bg-cyan-500/20 text-cyan-200 shadow-[0_0_0_1px_oklch(0.72_0.12_195/0.35)]"
								: "text-muted-foreground hover:bg-white/5 hover:text-foreground",
						)}
					>
						{t("zh")}
					</button>
					{sep}
					<button
						type="button"
						onClick={makeReplace("zh-TW")}
						className={cn(
							"transition-colors",
							barBtn,
							locale === "zh-TW"
								? "bg-cyan-500/20 text-cyan-200 shadow-[0_0_0_1px_oklch(0.72_0.12_195/0.35)]"
								: "text-muted-foreground hover:bg-white/5 hover:text-foreground",
						)}
					>
						{t("zhTW")}
					</button>
					{sep}
					<button
						type="button"
						onClick={makeReplace("en")}
						className={cn(
							"transition-colors",
							barBtn,
							locale === "en"
								? "bg-cyan-500/20 text-cyan-200 shadow-[0_0_0_1px_oklch(0.72_0.12_195/0.35)]"
								: "text-muted-foreground hover:bg-white/5 hover:text-foreground",
						)}
					>
						{t("en")}
					</button>
				</div>

				<details ref={menuRef} className="relative sm:hidden">
					<summary
						className={cn(
							"flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-cyan-500/25 bg-background/80 px-2.5 py-1.5 text-xs font-medium text-foreground outline-none",
							"hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-cyan-400/50 [&::-webkit-details-marker]:hidden",
						)}
						aria-label={t("label")}
					>
						<Languages className="size-4 shrink-0 text-cyan-300/90" aria-hidden />
						<span className="max-w-[5.5rem] truncate">{currentLabel}</span>
					</summary>
					<div
						className="border-border/80 bg-popover absolute right-0 z-50 mt-1 min-w-[9.5rem] rounded-lg border p-1 shadow-lg ring-1 ring-foreground/10"
						role="group"
						aria-label={t("label")}
					>
						<button
							type="button"
							onClick={makeReplace("zh")}
							className={cn(
								"flex w-full rounded-md px-2.5 py-2 text-left text-sm transition-colors",
								locale === "zh"
									? "bg-cyan-500/15 text-cyan-200"
									: "text-muted-foreground hover:bg-white/5 hover:text-foreground",
							)}
						>
							{t("zh")}
						</button>
						<button
							type="button"
							onClick={makeReplace("zh-TW")}
							className={cn(
								"flex w-full rounded-md px-2.5 py-2 text-left text-sm transition-colors",
								locale === "zh-TW"
									? "bg-cyan-500/15 text-cyan-200"
									: "text-muted-foreground hover:bg-white/5 hover:text-foreground",
							)}
						>
							{t("zhTW")}
						</button>
						<button
							type="button"
							onClick={makeReplace("en")}
							className={cn(
								"flex w-full rounded-md px-2.5 py-2 text-left text-sm transition-colors",
								locale === "en"
									? "bg-cyan-500/15 text-cyan-200"
									: "text-muted-foreground hover:bg-white/5 hover:text-foreground",
							)}
						>
							{t("en")}
						</button>
					</div>
				</details>
			</div>
		);
	}

	return (
		<div
			className={cn("flex flex-wrap items-center gap-1", className)}
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
			{sep}
			<button
				type="button"
				onClick={() => router.replace(pathname, { locale: "zh-TW" })}
				className={cn(
					btn,
					"transition-colors",
					locale === "zh-TW"
						? "bg-cyan-500/20 text-cyan-200 shadow-[0_0_0_1px_oklch(0.72_0.12_195/0.35)]"
						: "text-muted-foreground hover:bg-white/5 hover:text-foreground",
				)}
			>
				{t("zhTW")}
			</button>
			{sep}
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
