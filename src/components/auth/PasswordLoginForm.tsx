"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { toast, Toaster } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isLocalDevAuthHost } from "@/lib/auth/passkey";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const LOCAL_RESET_ON_PROD_URL = "https://leolearnstotrade.com/login";

type FormValues = {
	email: string;
	password: string;
};

export function PasswordLoginForm() {
	const locale = useLocale();
	const searchParams = useSearchParams();
	const t = useTranslations("MagicLogin");
	const [busy, setBusy] = useState(false);
	const [forgotBusy, setForgotBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [localDev, setLocalDev] = useState(false);

	useEffect(() => {
		setLocalDev(isLocalDevAuthHost(window.location.hostname));
	}, []);

	const {
		register,
		handleSubmit,
		getValues,
		trigger,
		formState: { errors },
	} = useForm<FormValues>({
		defaultValues: { email: "", password: "" },
		mode: "onBlur",
	});

	const nextParam = searchParams.get("next");
	const nextPath =
		nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
			? nextParam
			: "/my-learning";

	const signIn = async (values: FormValues) => {
		setBusy(true);
		setError(null);
		try {
			const sb = getSupabaseBrowserClient();
			if (!sb) {
				setError(t("sendFailed"));
				return;
			}
			const { error: signInError } = await sb.auth.signInWithPassword({
				email: values.email.trim().toLowerCase(),
				password: values.password,
			});
			if (signInError) {
				setError(t("passwordLoginFailed"));
				return;
			}
			window.location.assign(nextPath);
		} catch {
			setError(t("passwordLoginFailed"));
		} finally {
			setBusy(false);
		}
	};

	/**
	 * Product history folded "forgot password" into the email magic-link flow.
	 * Restore the affordance on the password tab by sending that same login link,
	 * then landing on the profile page so the user can set a new password.
	 */
	const sendForgotPasswordLink = async () => {
		if (localDev) {
			toast.message(t("forgotPasswordLocal"));
			window.open(LOCAL_RESET_ON_PROD_URL, "_blank", "noopener,noreferrer");
			return;
		}

		const emailValid = await trigger("email");
		if (!emailValid) return;
		const email = getValues("email").trim().toLowerCase();
		if (!email) return;

		setForgotBusy(true);
		setError(null);
		try {
			const res = await fetch("/api/auth/send-login-link", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email,
					next: "/my-profile",
				}),
			});
			const js = (await res.json()) as {
				success?: boolean;
				error?: string;
				errorEn?: string;
			};
			if (!res.ok || !js.success) {
				const errMsg =
					locale === "en"
						? (js.errorEn ?? js.error ?? t("sendFailed"))
						: (js.error ?? js.errorEn ?? t("sendFailed"));
				toast.error(errMsg);
				return;
			}
			toast.success(t("forgotPasswordSent"));
		} catch {
			toast.error(t("sendFailed"));
		} finally {
			setForgotBusy(false);
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
				<div className="flex items-center justify-between gap-3">
					<Label htmlFor="password-login-password">{t("passwordLabel")}</Label>
					<button
						type="button"
						className="text-cyan-400 text-xs underline-offset-4 hover:underline disabled:opacity-50"
						disabled={busy || forgotBusy}
						onClick={() => void sendForgotPasswordLink()}
					>
						{forgotBusy ? t("sending") : t("forgotPassword")}
					</button>
				</div>
				<Input
					id="password-login-password"
					type="password"
					autoComplete="current-password"
					{...register("password", { required: true, minLength: 8 })}
				/>
				{errors.password ? <p className="text-destructive text-xs">{t("passwordRequired")}</p> : null}
			</div>

			<Button type="submit" disabled={busy || forgotBusy} className={busy ? "gap-2" : ""}>
				{busy ? (
					<>
						<Loader2 className="size-4 animate-spin" aria-hidden /> {t("passwordLoggingIn")}
					</>
				) : (
					t("passwordLogin")
				)}
			</Button>

			<p className="text-muted-foreground text-xs">
				{localDev ? t("forgotPasswordLocal") : t("forgotPasswordHint")}
			</p>

			{error ? <p className="text-destructive text-sm">{error}</p> : null}
			<Toaster richColors theme="dark" position="top-center" />
		</form>
	);
}
