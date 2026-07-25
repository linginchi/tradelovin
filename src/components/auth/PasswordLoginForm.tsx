"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormValues = {
	email: string;
	password: string;
};

export function PasswordLoginForm() {
	const searchParams = useSearchParams();
	const locale = useLocale();
	const t = useTranslations("MagicLogin");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<FormValues>({
		defaultValues: { email: "", password: "" },
		mode: "onBlur",
	});

	const nextParam = searchParams.get("next");
	const rawNext =
		nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
			? nextParam
			: "/courses";
	// 带 locale，避免跳到无前缀路径时命中旧缓存/错误入口
	const nextPath = rawNext === `/${locale}` || rawNext.startsWith(`/${locale}/`)
		? rawNext
		: `/${locale}${rawNext}`;

	const signIn = async (values: FormValues) => {
		setBusy(true);
		setError(null);
		try {
			const res = await fetch("/api/auth/password-login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					email: values.email.trim().toLowerCase(),
					password: values.password,
				}),
			});
			const js = (await res.json()) as {
				success?: boolean;
				error?: string;
				errorEn?: string;
			};
			if (!res.ok || !js.success) {
				setError(
					locale === "en"
						? (js.errorEn ?? js.error ?? t("passwordLoginFailed"))
						: (js.error ?? js.errorEn ?? t("passwordLoginFailed")),
				);
				return;
			}
			// 整页跳转，避免 SPA 残留未登录态 / 旧资源
			window.location.replace(nextPath);
		} catch {
			setError(t("passwordLoginFailed"));
		} finally {
			setBusy(false);
		}
	};

	return (
		<form onSubmit={handleSubmit(signIn)} className="space-y-4" noValidate>
			<div className="space-y-2">
				<Label htmlFor="password-login-email">{t("emailLabel")}</Label>
				<Input
					id="password-login-email"
					type="email"
					autoComplete="email"
					{...register("email", { required: true })}
				/>
				{errors.email ? <p className="text-destructive text-xs">{t("invalidEmail")}</p> : null}
			</div>

			<div className="space-y-2">
				<Label htmlFor="password-login-password">{t("passwordLabel")}</Label>
				<Input
					id="password-login-password"
					type="password"
					autoComplete="current-password"
					{...register("password", { required: true, minLength: 8 })}
				/>
				{errors.password ? <p className="text-destructive text-xs">{t("passwordRequired")}</p> : null}
			</div>

			<Button type="submit" disabled={busy} className={busy ? "gap-2" : ""}>
				{busy ? (
					<>
						<Loader2 className="size-4 animate-spin" aria-hidden /> {t("passwordLoggingIn")}
					</>
				) : (
					t("passwordLogin")
				)}
			</Button>

			{error ? <p className="text-destructive text-sm">{error}</p> : null}
		</form>
	);
}
