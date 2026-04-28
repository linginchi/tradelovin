"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useLocale, useTranslations } from "next-intl";
import { toast, Toaster } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";

type FormValues = {
	email: string;
	otp: string;
};

export function OtpLoginForm() {
	const router = useRouter();
	const locale = useLocale();
	const t = useTranslations("OtpLogin");
	const tReg = useTranslations("Registration");
	const [step, setStep] = useState<1 | 2>(1);
	const [busy, setBusy] = useState(false);

	const {
		register,
		handleSubmit,
		watch,
		trigger,
		formState: { errors },
	} = useForm<FormValues>({
		defaultValues: { email: "", otp: "" },
		mode: "onBlur",
	});

	const sendCode = async () => {
		const ok = await trigger(["email"]);
		if (!ok) return;
		const email = watch("email").trim().toLowerCase();
		setBusy(true);
		const res = await fetch("/api/auth/send-code", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, intent: "login" }),
		});
		const js = (await res.json()) as {
			success?: boolean;
			error?: string;
			errorEn?: string;
		};
		setBusy(false);
		if (res.status === 404) {
			const msg = locale === "en" ? (js.errorEn ?? js.error ?? "Not found") : (js.error ?? "未找到");
			toast.error(msg);
			return;
		}
		if (!res.ok || !js.success) {
			const errMsg =
				locale === "en"
					? (typeof js.errorEn === "string" ? js.errorEn : js.error)
					: (typeof js.error === "string" ? js.error : js.errorEn);
			toast.error(typeof errMsg === "string" ? errMsg : t("busySend"));
			return;
		}
		toast.success(locale === "en" ? "Code sent." : "验证码已发送");
		setStep(2);
	};

	const verify = async (values: FormValues) => {
		const email = values.email.trim().toLowerCase();
		const code = values.otp.trim();
		if (code.length !== 6) {
			toast.error(locale === "en" ? "Enter the 6-digit code." : "请填写 6 位验证码");
			return;
		}
		setBusy(true);
		const res = await fetch("/api/auth/verify", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({ email, code, intent: "login" }),
		});
		const js = (await res.json()) as { success?: boolean; error?: string };
		setBusy(false);
		if (!res.ok || !js.success) {
			toast.error(typeof js.error === "string" ? js.error : "Error");
			return;
		}
		router.replace("/trade");
	};

	return (
		<>
			<form
				onSubmit={step === 1 ? (e) => { e.preventDefault(); void sendCode(); } : handleSubmit(verify)}
				className="border-border/80 bg-card/40 mx-auto w-full max-w-lg space-y-6 rounded-xl border p-6 shadow-sm backdrop-blur-sm md:p-8"
				noValidate
			>
				<div className="space-y-1">
					<h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
					<p className="text-muted-foreground text-sm">{t("intro")}</p>
				</div>

				<p className="text-muted-foreground text-sm">
					{t("noAccount")}{" "}
					<Link href="/register" className="text-cyan-400 underline-offset-4 hover:underline">
						{t("goRegister")}
					</Link>
				</p>

				{step === 1 && (
					<div className="space-y-4">
						<p className="text-muted-foreground text-xs font-medium">{t("step1Badge")}</p>
						<div className="space-y-2">
							<Label htmlFor="email">{tReg("email")}</Label>
							<Input
								id="email"
								type="email"
								autoComplete="email"
								{...register("email", { required: true })}
							/>
							{errors.email && <p className="text-destructive text-xs">Invalid email</p>}
						</div>
						<Button type="submit" disabled={busy} className={busy ? "gap-2" : ""}>
							{busy ? (
								<>
									<Loader2 className="size-4 animate-spin" aria-hidden /> {t("busySend")}
								</>
							) : (
								t("sendCode")
							)}
						</Button>
					</div>
				)}

				{step === 2 && (
					<div className="space-y-4">
						<p className="text-muted-foreground text-xs font-medium">{t("step2Badge")}</p>
						<Button type="button" variant="ghost" size="sm" className="-ml-2 h-auto px-2 py-1 text-xs" onClick={() => setStep(1)}>
							{t("back")}
						</Button>
						<div className="space-y-2">
							<Label htmlFor="otp">{t("otpLabel")}</Label>
							<Input
								id="otp"
								inputMode="numeric"
								autoComplete="one-time-code"
								maxLength={6}
								{...register("otp", { required: true })}
							/>
						</div>
						<Button type="submit" disabled={busy} className={busy ? "gap-2" : ""}>
							{busy ? (
								<>
									<Loader2 className="size-4 animate-spin" aria-hidden /> {t("busyVerify")}
								</>
							) : (
								t("verify")
							)}
						</Button>
					</div>
				)}
			</form>
			<Toaster richColors theme="dark" position="top-center" />
		</>
	);
}
