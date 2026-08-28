"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveAdminLoginNextPath } from "@/lib/staff-pay/staff-pay";
import { cn } from "@/lib/utils";

type FormValues = {
	email: string;
};

const RESEND_COOLDOWN_SECONDS = 60;

export function AdminEmailLinkLoginForm() {
	const t = useTranslations("AdminAuth");
	const searchParams = useSearchParams();
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [cooldownSeconds, setCooldownSeconds] = useState(0);

	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<FormValues>({
		defaultValues: { email: "" },
		mode: "onBlur",
	});

	const nextPath = resolveAdminLoginNextPath(searchParams.get("next"));

	async function sendLink(values: FormValues) {
		if (cooldownSeconds > 0) return;
		setBusy(true);
		setError(null);
		setMessage(null);
		try {
			const res = await fetch("/api/auth/send-login-link", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: values.email.trim().toLowerCase(),
					next: nextPath,
				}),
			});
			const data = (await res.json()) as {
				success?: boolean;
				error?: string;
				errorEn?: string;
			};
			if (!res.ok || !data.success) {
				setError(data.error ?? data.errorEn ?? t("errorGeneric"));
				return;
			}
			setMessage(t("magicLinkSent"));
			setCooldownSeconds(RESEND_COOLDOWN_SECONDS);
			const timer = window.setInterval(() => {
				setCooldownSeconds((prev) => {
					if (prev <= 1) {
						window.clearInterval(timer);
						return 0;
					}
					return prev - 1;
				});
			}, 1000);
		} catch {
			setError(t("errorGeneric"));
		} finally {
			setBusy(false);
		}
	}

	return (
		<Card className="border-border/80 bg-card/45 mx-auto w-full max-w-md shadow-sm backdrop-blur-md">
			<CardHeader>
				<CardTitle className="text-xl">{t("title")}</CardTitle>
				<CardDescription>{t("magicLinkSubtitle")}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<form className="space-y-3" onSubmit={handleSubmit(sendLink)}>
					<div className="space-y-2">
						<Label htmlFor="admin-email">{t("emailLabel")}</Label>
						<Input
							id="admin-email"
							type="email"
							autoComplete="email"
							{...register("email", { required: true })}
							placeholder={t("emailPlaceholder")}
							className="h-10"
						/>
						{errors.email ? <p className="text-destructive text-xs">{t("invalidEmail")}</p> : null}
					</div>
					<div className="flex flex-wrap gap-2">
						<Button type="submit" className="min-w-0 flex-1" disabled={busy || cooldownSeconds > 0}>
							{busy ? (
								<span className="inline-flex items-center gap-2">
									<Loader2 className="size-4 animate-spin" aria-hidden />
									{t("sending")}
								</span>
							) : cooldownSeconds > 0 ? (
								t("resendIn", { seconds: cooldownSeconds })
							) : (
								t("sendMagicLink")
							)}
						</Button>
						<Button type="submit" variant="outline" disabled={busy || cooldownSeconds > 0}>
							{cooldownSeconds > 0 ? t("resendDisabled") : t("resend")}
						</Button>
					</div>
				</form>

				{message ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p> : null}
				{error ? <p className="text-destructive text-sm">{error}</p> : null}

				<p className="text-center text-sm">
					<Link href="/" className={cn("text-cyan-300 underline-offset-4 hover:underline")}>
						{t("backSite")}
					</Link>
				</p>
			</CardContent>
		</Card>
	);
}
