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
import { Link } from "@/i18n/navigation";
import { GoogleLoginButton } from "@/components/auth/GoogleLoginButton";

type FormValues = {
	email: string;
};

const RESEND_COOLDOWN_SECONDS = 60;

export function EmailLinkLoginForm() {
	const locale = useLocale();
	const searchParams = useSearchParams();
	const t = useTranslations("MagicLogin");
	const [busy, setBusy] = useState(false);
	const [cooldownSeconds, setCooldownSeconds] = useState(0);
	const resolvedNextPath = (() => {
		const nextParam = searchParams.get("next");
		if (nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")) {
			return nextParam;
		}
		return "/my-learning";
	})();

	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<FormValues>({
		defaultValues: { email: "" },
		mode: "onBlur",
	});

	useEffect(() => {
		if (cooldownSeconds <= 0) return;
		const timer = window.setTimeout(() => {
			setCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
		}, 1000);
		return () => window.clearTimeout(timer);
	}, [cooldownSeconds]);

	const sendLink = async (values: FormValues) => {
		if (cooldownSeconds > 0) return;
		console.log("[login-page] send link clicked", { next: resolvedNextPath });
		setBusy(true);
		const res = await fetch("/api/auth/send-login-link", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				email: values.email.trim().toLowerCase(),
				next: resolvedNextPath,
			}),
		});
		const js = (await res.json()) as {
			success?: boolean;
			error?: string;
			errorEn?: string;
		};
		setBusy(false);
		if (!res.ok || !js.success) {
			const errMsg =
				locale === "en"
					? (js.errorEn ?? js.error ?? t("sendFailed"))
					: (js.error ?? js.errorEn ?? t("sendFailed"));
			toast.error(errMsg);
			return;
		}
		setCooldownSeconds(RESEND_COOLDOWN_SECONDS);
		toast.success(t("sentSuccessWithHint"));
	};
	const handleResend = async () => {
		await handleSubmit(sendLink)();
	};

	return (
		<form onSubmit={handleSubmit(sendLink)} className="space-y-6" noValidate>
			<p className="text-muted-foreground text-sm">{t("hint")}</p>
			{searchParams.get("error") === "invalid_link" ? (
				<p className="text-destructive text-sm">{t("invalidOrExpired")}</p>
			) : null}
			{searchParams.get("error") === "oauth_failed" ? (
				<p className="text-destructive text-sm">{t("googleLoginFailed")}</p>
			) : null}

			<div className="space-y-2">
				<Label htmlFor="email">{t("emailLabel")}</Label>
				<Input id="email" type="email" autoComplete="email" {...register("email", { required: true })} />
				{errors.email && <p className="text-destructive text-xs">{t("invalidEmail")}</p>}
			</div>

			<div className="flex flex-wrap gap-2">
				<Button type="submit" disabled={busy || cooldownSeconds > 0} className={busy ? "gap-2" : ""}>
					{busy ? (
						<>
							<Loader2 className="size-4 animate-spin" aria-hidden /> {t("sending")}
						</>
					) : cooldownSeconds > 0 ? (
						t("resendIn", { seconds: cooldownSeconds })
					) : (
						t("sendLink")
					)}
				</Button>
				<Button
					type="button"
					variant="outline"
					disabled={busy || cooldownSeconds > 0}
					className="min-w-28"
					onClick={() => void handleResend()}
				>
					{cooldownSeconds > 0 ? t("resendDisabled") : t("resend")}
				</Button>
				<GoogleLoginButton nextPath={resolvedNextPath} />
			</div>

			<p className="text-muted-foreground text-xs">
				{t("noPasswordNote")}{" "}
				<Link href="/register" className="text-cyan-400 underline-offset-4 hover:underline">
					{t("registerSame")}
				</Link>
			</p>

			<Toaster richColors theme="dark" position="top-center" />
		</form>
	);
}
