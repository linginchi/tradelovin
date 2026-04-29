"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast, Toaster } from "sonner";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type DevTestAccount = "kk" | "william" | "mark";

type Props = {
	className?: string;
	showToaster?: boolean;
	idPrefix?: string;
};

export function DevTestQuickLoginCard({
	className,
	showToaster = false,
	idPrefix = "dev-test-quick-login",
}: Props) {
	const router = useRouter();
	const locale = useLocale();
	const t = useTranslations("OtpLogin");
	const [busy, setBusy] = useState(false);

	const enabledByPublicSwitch =
		process.env.NEXT_PUBLIC_ENABLE_DEV_TEST_ACCOUNTS === "1" ||
		process.env.NEXT_PUBLIC_ENABLE_DEV_TEST_ACCOUNTS === "true";
	const enabled = process.env.NODE_ENV !== "production" || enabledByPublicSwitch;

	if (!enabled) return null;

	const onQuickLogin = async (account: DevTestAccount) => {
		setBusy(true);
		const res = await fetch("/api/auth/dev-test-login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({ account, password: "123456" }),
		});
		const js = (await res.json()) as { success?: boolean; error?: string; errorEn?: string };
		setBusy(false);
		if (!res.ok || !js.success) {
			const errMsg =
				locale === "en"
					? (js.errorEn ?? js.error ?? t("verifyFailed"))
					: (js.error ?? js.errorEn ?? t("verifyFailed"));
			toast.error(errMsg);
			return;
		}

		router.replace("/trade");
		router.refresh();
	};

	return (
		<>
			<div className={cn("space-y-3 rounded-md border border-border/60 p-3", className)}>
				<p className="text-muted-foreground text-xs font-medium">{t("devQuickLoginTitle")}</p>
				<p className="text-muted-foreground text-xs">kk / william / mark（密码：123456）</p>
				<div className="grid gap-2 sm:grid-cols-3">
					{(["kk", "william", "mark"] as const).map((account) => (
						<Button
							key={account}
							id={`${idPrefix}-${account}`}
							type="button"
							variant="outline"
							disabled={busy}
							onClick={() => void onQuickLogin(account)}
						>
							{busy ? t("busyVerify") : account}
						</Button>
					))}
				</div>
			</div>
			{showToaster ? <Toaster richColors theme="dark" position="top-center" /> : null}
		</>
	);
}
