"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { z } from "zod";

import { LazyWhenVisible } from "@/components/LazyWhenVisible";
import { Button } from "@/components/ui/button";
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

const experienceValues = [
	"none",
	"lt_1y",
	"y1_3",
	"gt_3",
	"professional",
] as const;

const recommendValues = ["yes", "no"] as const;

export type RegistrationFormValues = {
	real_name?: string;
	nickname: string;
	email: string;
	phone?: string;
	trading_experience: (typeof experienceValues)[number];
	trading_style_preferences: Array<z.infer<typeof tradingStyleValueEnum>>;
	learning_goals?: string;
	willing_to_recommend: (typeof recommendValues)[number];
};

function buildRegistrationSchema(t: (key: string) => string) {
	return z.object({
		real_name: z.string().optional(),
		nickname: z.string().min(1, t("errors.nicknameRequired")),
		email: z.string().min(1, t("errors.emailRequired")).email(t("errors.emailInvalid")),
		phone: z.string().optional(),
		trading_experience: z.enum(experienceValues),
		trading_style_preferences: z
			.array(tradingStyleValueEnum)
			.max(3, t("errors.stylesMax")),
		learning_goals: z.string().optional(),
		willing_to_recommend: z.enum(recommendValues),
	});
}

export function RegistrationForm() {
	const t = useTranslations("Registration");
	const tExp = useTranslations("Registration.experience");
	const tRec = useTranslations("Registration.recommend");
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [submitOk, setSubmitOk] = useState(false);
	const [fieldErrors, setFieldErrors] = useState<
		Partial<Record<keyof RegistrationFormValues, string>>
	>({});

	const registrationSchema = useMemo(() => buildRegistrationSchema(t), [t]);
	const styleOptions = useMemo(
		() =>
			t.raw("styles") as Array<{
				value: z.infer<typeof tradingStyleValueEnum>;
				label: string;
				description: string;
			}>,
		[t],
	);

	const defaultValues = useMemo<RegistrationFormValues>(
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
		formState: { isSubmitting },
	} = useForm<RegistrationFormValues>({ defaultValues });

	const selectedStyles = watch("trading_style_preferences") ?? [];

	const toggleStyle = (value: z.infer<typeof tradingStyleValueEnum>) => {
		const next = new Set(selectedStyles);
		if (next.has(value)) {
			next.delete(value);
		} else {
			if (next.size >= 3) return;
			next.add(value);
		}
		setValue("trading_style_preferences", Array.from(next), {
			shouldValidate: true,
			shouldDirty: true,
		});
		setFieldErrors((prev) => ({ ...prev, trading_style_preferences: undefined }));
	};

	const onSubmit = async (raw: RegistrationFormValues) => {
		setSubmitError(null);
		setSubmitOk(false);
		const parsed = registrationSchema.safeParse(raw);
		if (!parsed.success) {
			const flat = parsed.error.flatten().fieldErrors;
			setFieldErrors({
				nickname: flat.nickname?.[0],
				email: flat.email?.[0],
				trading_experience: flat.trading_experience?.[0],
				trading_style_preferences: flat.trading_style_preferences?.[0],
				willing_to_recommend: flat.willing_to_recommend?.[0],
			});
			return;
		}
		setFieldErrors({});

		const res = await fetch("/api/registrations/public", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				real_name: parsed.data.real_name?.trim() || null,
				nickname: parsed.data.nickname.trim(),
				email: parsed.data.email.trim().toLowerCase(),
				phone: parsed.data.phone?.trim() || null,
				trading_experience: parsed.data.trading_experience,
				trading_style_preferences: parsed.data.trading_style_preferences,
				learning_goals: parsed.data.learning_goals?.trim() || null,
				willing_to_recommend: parsed.data.willing_to_recommend === "yes",
			}),
		});

		const json = (await res.json()) as { success?: boolean; error?: string };
		if (!res.ok || !json.success) {
			setSubmitError(json.error || t("errors.submitFailed"));
			return;
		}

		setSubmitOk(true);
	};

	return (
		<form
			onSubmit={handleSubmit(onSubmit)}
			className="border-border/80 bg-card/40 mx-auto w-full max-w-lg space-y-6 rounded-xl border p-6 shadow-sm backdrop-blur-sm md:p-8"
			noValidate
		>
			<div className="space-y-1">
				<h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
				<p className="text-muted-foreground text-sm">{t("intro")}</p>
			</div>

			<div className="space-y-2">
				<label className="text-sm font-medium" htmlFor="real_name">
					{t("realName")}{" "}
					<span className="text-muted-foreground font-normal">{t("realNameHint")}</span>
				</label>
				<input
					id="real_name"
					type="text"
					autoComplete="name"
					className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
					{...register("real_name")}
				/>
			</div>

			<div className="space-y-2">
				<label className="text-sm font-medium" htmlFor="nickname">
					{t("nickname")} <span className="text-destructive">*</span>
					<span className="text-muted-foreground font-normal">{t("nicknameHint")}</span>
				</label>
				<input
					id="nickname"
					type="text"
					autoComplete="nickname"
					className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
					{...register("nickname")}
				/>
				{fieldErrors.nickname && (
					<p className="text-destructive text-xs">{fieldErrors.nickname}</p>
				)}
			</div>

			<div className="space-y-2">
				<label className="text-sm font-medium" htmlFor="email">
					{t("email")} <span className="text-destructive">*</span>
				</label>
				<input
					id="email"
					type="email"
					autoComplete="email"
					className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
					{...register("email")}
				/>
				{fieldErrors.email && (
					<p className="text-destructive text-xs">{fieldErrors.email}</p>
				)}
			</div>

			<div className="space-y-2">
				<label className="text-sm font-medium" htmlFor="phone">
					{t("phone")}{" "}
					<span className="text-muted-foreground font-normal">{t("phoneHint")}</span>
				</label>
				<input
					id="phone"
					type="tel"
					autoComplete="tel"
					className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
					{...register("phone")}
				/>
			</div>

			<fieldset className="space-y-3">
				<legend className="text-sm font-medium">
					{t("experienceLegend")} <span className="text-destructive">*</span>
				</legend>
				<div className="flex flex-col gap-2">
					{experienceValues.map((v) => (
						<label
							key={v}
							className="border-border/60 has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"
						>
							<input
								type="radio"
								value={v}
								className="text-primary"
								{...register("trading_experience")}
							/>
							{tExp(v)}
						</label>
					))}
				</div>
				{fieldErrors.trading_experience && (
					<p className="text-destructive text-xs">{fieldErrors.trading_experience}</p>
				)}
			</fieldset>

			<fieldset className="space-y-3">
				<legend className="text-sm font-medium">
					{t("stylesLegend")}{" "}
					<span className="text-muted-foreground font-normal">{t("stylesHint")}</span>
				</legend>
				<p className="text-muted-foreground text-xs">
					{t("stylesCounter", { count: selectedStyles.length })}
				</p>
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
									<span className="text-muted-foreground mt-0.5 block text-xs">
										{opt.description}
									</span>
								</span>
							</label>
						);
					})}
				</div>
				{fieldErrors.trading_style_preferences && (
					<p className="text-destructive text-xs">
						{fieldErrors.trading_style_preferences}
					</p>
				)}
			</fieldset>

			<LazyWhenVisible minHeight={120} rootMargin="80px">
				<RegistrationFormOptionalFields register={register} />
			</LazyWhenVisible>

			<fieldset className="space-y-3">
				<legend className="text-sm font-medium">
					{t("recommendLegend")} <span className="text-destructive">*</span>
				</legend>
				<div className="flex flex-col gap-2">
					{recommendValues.map((v) => (
						<label
							key={v}
							className="border-border/60 has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"
						>
							<input
								type="radio"
								value={v}
								className="text-primary"
								{...register("willing_to_recommend")}
							/>
							{tRec(v)}
						</label>
					))}
				</div>
				{fieldErrors.willing_to_recommend && (
					<p className="text-destructive text-xs">
						{fieldErrors.willing_to_recommend}
					</p>
				)}
			</fieldset>

			{submitError && (
				<p className="text-destructive bg-destructive/10 rounded-md px-3 py-2 text-sm">
					{submitError}
				</p>
			)}
			{submitOk && (
				<p className="text-sm text-emerald-600 dark:text-emerald-400">{t("success")}</p>
			)}

			<Button type="submit" disabled={isSubmitting} className="w-full md:w-auto">
				{isSubmitting ? t("submitting") : t("submit")}
			</Button>
		</form>
	);
}
