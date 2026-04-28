"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm, type UseFormRegister } from "react-hook-form";
import { useLocale, useTranslations } from "next-intl";
import { toast, Toaster } from "sonner";
import { z } from "zod";

import { LazyWhenVisible } from "@/components/LazyWhenVisible";
import type { RegistrationFormValues } from "@/components/registration-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import { normalizeRegisterBody } from "@/lib/auth/register-payload";
import { cn } from "@/lib/utils";

const RegistrationFormOptionalFields = dynamic(
	() => import("@/components/registration-form-optional"),
	{ ssr: false },
);

const tradingStyleValueEnum = z.enum([
	"trend_following",
	"reversal",
	"breakout",
	"range_bound",
	"scalping",
	"order_book",
	"quant",
	"undecided",
]);

const experienceValues = ["none", "lt_1y", "y1_3", "gt_3", "professional"] as const;
const recommendValues = ["yes", "no"] as const;

type FormValues = Omit<RegistrationFormValues, never>;

export function RegisterQuickForm() {
	const router = useRouter();
	const locale = useLocale();
	const tWizard = useTranslations("RegisterGate1");
	const t = useTranslations("Registration");
	const tExp = useTranslations("Registration.experience");
	const tRec = useTranslations("Registration.recommend");

	const [finished, setFinished] = useState(false);
	const [busy, setBusy] = useState(false);

	const styleOptions = useMemo(
		() =>
			t.raw("styles") as Array<{
				value: z.infer<typeof tradingStyleValueEnum>;
				label: string;
				description: string;
			}>,
		[t],
	);

	const defaultValues = useMemo<FormValues>(
		() => ({
			real_name: "",
			nickname: "",
			email: "",
			phone: "",
			trading_experience: "none",
			trading_style_preferences: [],
			learning_goals: "",
			willing_to_recommend: "no",
		}),
		[],
	);

	const {
		register,
		handleSubmit,
		watch,
		setValue,
		formState: { errors },
	} = useForm<FormValues>({
		defaultValues,
		mode: "onBlur",
	});

	const selectedStyles = watch("trading_style_preferences") ?? [];

	const toggleStyle = (value: z.infer<typeof tradingStyleValueEnum>) => {
		const next = new Set(selectedStyles);
		if (next.has(value)) next.delete(value);
		else if (next.size >= 3) return;
		else next.add(value);
		setValue("trading_style_preferences", Array.from(next), {
			shouldValidate: true,
			shouldDirty: true,
		});
	};

	const onSubmit = async (raw: FormValues) => {
		if (finished) return;
		const normalized = normalizeRegisterBody({
			email: raw.email.trim(),
			nickname: raw.nickname.trim(),
			realName: raw.real_name?.trim() || null,
			phone: raw.phone?.trim() || null,
			tradingExperience: raw.trading_experience,
			tradingStylePreferences: raw.trading_style_preferences,
			learningGoals: raw.learning_goals?.trim() || null,
			willingToRecommend: raw.willing_to_recommend === "yes",
		});
		if (!normalized.ok) {
			toast.error(t("errors.emailInvalid"));
			return;
		}

		setBusy(true);
		const res = await fetch("/api/auth/quick-register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify(normalized.payload),
		});
		const js = (await res.json()) as {
			success?: boolean;
			error?: string;
			errorEn?: string;
			code?: string;
		};
		setBusy(false);

		if (res.status === 409) {
			const msg =
				locale === "en" ? (js.errorEn ?? js.error ?? tWizard("dupEmail")) : (js.error ?? tWizard("dupEmail"));
			toast.error(msg);
			return;
		}
		if (res.status === 403 && js.code === "QUICK_REGISTER_DISABLED") {
			const msg = locale === "en" ? (js.errorEn ?? js.error) : (js.error ?? js.errorEn ?? "");
			toast.error(msg || t("errors.submitFailed"));
			return;
		}
		if (!res.ok || !js.success) {
			toast.error(typeof js.error === "string" ? js.error : t("errors.submitFailed"));
			return;
		}
		setFinished(true);
		router.push("/trade");
	};

	return (
		<>
			<form
				onSubmit={handleSubmit(onSubmit)}
				className="border-border/80 bg-card/40 mx-auto w-full max-w-lg space-y-6 rounded-xl border p-6 shadow-sm backdrop-blur-sm md:p-8"
				noValidate
			>
				<div className="space-y-1">
					<h1 className="text-xl font-semibold tracking-tight">{tWizard("title")}</h1>
					<p className="text-muted-foreground text-sm">{tWizard("intro")}</p>
				</div>

				<p className="text-muted-foreground text-sm">
					{tWizard("hasAccount")}{" "}
					<Link href="/login" className="text-cyan-400 underline-offset-4 hover:underline">
						{tWizard("goLogin")}
					</Link>
				</p>

				<div className="space-y-2">
					<Label htmlFor="nickname">
						{t("nickname")} <span className="text-destructive">*</span>
					</Label>
					<Input
						id="nickname"
						autoComplete="nickname"
						{...register("nickname", { required: true })}
						disabled={finished}
					/>
					{errors.nickname && <p className="text-destructive text-xs">{tWizard("errNickname")}</p>}
				</div>

				<div className="space-y-2">
					<Label htmlFor="email">
						{t("email")} <span className="text-destructive">*</span>
					</Label>
					<Input
						id="email"
						type="email"
						autoComplete="email"
						{...register("email", { required: true })}
						disabled={finished}
					/>
					{errors.email && <p className="text-destructive text-xs">{tWizard("errEmail")}</p>}
				</div>

				<div className="space-y-2">
					<Label htmlFor="real_name">
						{t("realName")}{" "}
						<span className="text-muted-foreground font-normal">{t("realNameHint")}</span>
					</Label>
					<Input id="real_name" type="text" autoComplete="name" {...register("real_name")} disabled={finished} />
				</div>

				<div className="space-y-2">
					<Label htmlFor="phone">
						{t("phone")}{" "}
						<span className="text-muted-foreground font-normal">{t("phoneHint")}</span>
					</Label>
					<Input id="phone" type="tel" autoComplete="tel" {...register("phone")} disabled={finished} />
				</div>

				<fieldset className="space-y-3" disabled={finished}>
					<legend className="text-sm font-medium">{t("experienceLegend")}</legend>
					<div className="flex flex-col gap-2">
						{experienceValues.map((v) => (
							<label
								key={v}
								className="border-border/60 has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"
							>
								<input type="radio" value={v} className="text-primary" {...register("trading_experience")} />
								{tExp(v)}
							</label>
						))}
					</div>
				</fieldset>

				<fieldset className="space-y-3" disabled={finished}>
					<legend className="text-sm font-medium">
						{t("stylesLegend")}{" "}
						<span className="text-muted-foreground font-normal">{t("stylesHint")}</span>
					</legend>
					<p className="text-muted-foreground text-xs">{t("stylesCounter", { count: selectedStyles.length })}</p>
					<div className="flex flex-col gap-2">
						{styleOptions.map((opt) => {
							const checked = selectedStyles.includes(opt.value);
							const disabled = !checked && selectedStyles.length >= 3;
							return (
								<label
									key={opt.value}
									className={cn(
										"border-border/60 flex cursor-pointer gap-3 rounded-lg border px-3 py-2 text-sm transition-colors",
										checked && "border-primary/40 bg-primary/5",
										disabled && "cursor-not-allowed opacity-50",
									)}
								>
									<input
										type="checkbox"
										className="text-primary mt-0.5 shrink-0"
										checked={checked}
										disabled={disabled}
										onChange={() => toggleStyle(opt.value)}
									/>
									<span>
										<span className="font-medium">{opt.label}</span>
										<span className="text-muted-foreground mt-0.5 block text-xs">{opt.description}</span>
									</span>
								</label>
							);
						})}
					</div>
				</fieldset>

				<LazyWhenVisible minHeight={100} rootMargin="80px">
					<RegistrationFormOptionalFields register={register as unknown as UseFormRegister<RegistrationFormValues>} />
				</LazyWhenVisible>

				<fieldset className="space-y-3" disabled={finished}>
					<legend className="text-sm font-medium">{t("recommendLegend")}</legend>
					<div className="flex flex-col gap-2">
						{recommendValues.map((v) => (
							<label
								key={v}
								className="border-border/60 has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"
							>
								<input type="radio" value={v} className="text-primary" {...register("willing_to_recommend")} />
								{tRec(v)}
							</label>
						))}
					</div>
				</fieldset>

				<Button type="submit" disabled={finished || busy} className={cn(busy && "gap-2", "w-full sm:w-auto")}>
					{busy ? (
						<>
							<Loader2 className="size-4 animate-spin" aria-hidden /> {tWizard("registering")}
						</>
					) : (
						tWizard("submitQuickRegister")
					)}
				</Button>
			</form>
			<Toaster richColors theme="dark" position="top-center" />
		</>
	);
}
