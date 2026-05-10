"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast, Toaster } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
	const [runtimeEnabled, setRuntimeEnabled] = useState<boolean | null>(null);
	const [account, setAccount] = useState<DevTestAccount>("kk");
	const [password, setPassword] = useState("");

	useEffect(() => {
		void (async () => {
			try {
				const res = await fetch("/api/auth/dev-test-login", { method: "GET" });
				const js = (await res.json()) as { enabled?: boolean };
				setRuntimeEnabled(Boolean(js.enabled));
			} catch {
				setRuntimeEnabled(false);
			}
		})();
	}, []);

	// 始终以运行时接口开关为准，避免构建期变量漂移导致入口误隐藏。
	if (runtimeEnabled !== true) return null;

	const onQuickLogin = async () => {
		if (!password.trim()) {
			toast.error(t("verifyFailed"));
			return;
		}
		setBusy(true);
		const res = await fetch("/api/auth/dev-test-login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({ account, password }),
		});
		const js = (await res.json()) as { success?: boolean; error?: string; errorEn?: string; code?: string };
		setBusy(false);
		if (!res.ok || !js.success) {
			if (js.code === "DEV_TEST_LOGIN_DISABLED") {
				setRuntimeEnabled(false);
			}
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
				<div className="space-y-2">
					<Label htmlFor={`${idPrefix}-account`}>{t("devAccountLabel")}</Label>
					<select
						id={`${idPrefix}-account`}
						value={account}
						disabled={busy}
						onChange={(e) => setAccount(e.target.value as DevTestAccount)}
						className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
					>
						<option value="kk">kk</option>
						<option value="william">william</option>
						<option value="mark">mark</option>
					</select>
				</div>
				<div className="space-y-2">
					<Label htmlFor={`${idPrefix}-password`}>{t("devPasswordLabel")}</Label>
					<Input
						id={`${idPrefix}-password`}
						type="password"
						value={password}
						disabled={busy}
						onChange={(e) => setPassword(e.target.value)}
						placeholder="123456"
					/>
				</div>
				<div className="pt-1">
					<Button
						id={`${idPrefix}-login`}
						type="button"
						variant="outline"
						disabled={busy}
						onClick={() => void onQuickLogin()}
					>
						{busy ? t("busyVerify") : t("devLoginButton")}
					</Button>
				</div>
			</div>
			{showToaster ? <Toaster richColors theme="dark" position="top-center" /> : null}
		</>
	);
}
