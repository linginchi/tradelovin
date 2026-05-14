"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { toast, Toaster } from "sonner";
import { z } from "zod";

import { LazyWhenVisible } from "@/components/LazyWhenVisible";
import type { RegistrationFormValues } from "@/components/registration-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveNicknameFromMetadata } from "@/lib/auth/profile-resolve";
import { useAuth } from "@/lib/auth/use-auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
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

export function EnrollmentForm() {
	const router = useRouter();
	const tEnroll = useTranslations("EnrollPage");
	const t = useTranslations("Registration");
	const tExp = useTranslations("Registration.experience");
	const tRec = useTranslations("Registration.recommend");

	const schema = useMemo(
		() =>
			z.object({
				real_name: z.string().optional(),
				phone: z.string().optional(),
				trading_experience: z.enum(experienceValues),
				trading_style_preferences: z.array(tradingStyleValueEnum).max(3, t("errors.stylesMax")),
				learning_goals: z.string().optional(),
				willing_to_recommend: z.enum(recommendValues),
			}),
		[t],
	);

	const styleOptions = useMemo(
		() =>
			t.raw("styles") as Array<{
				value: z.infer<typeof tradingStyleValueEnum>;
				label: string;
				description: string;
			}>,
		[t],
	);

	const [profile, setProfile] = useState<{ nickname: string; email: string } | null>(null);
	const [loading, setLoading] = useState(true);
	const [fieldErrors, setFieldErrors] = useState<
		Partial<Record<keyof RegistrationFormValues, string>>
	>({});

	const {
		register,
		handleSubmit,
		watch,
		setValue,
		formState: { isSubmitting },
	} = useForm<RegistrationFormValues>({
		defaultValues: {
			nickname: "",
			email: "",
			real_name: "",
			phone: "",
			trading_experience: "none",
			trading_style_preferences: [],
			learning_goals: "",
			willing_to_recommend: "no",
		},
	});

	const selectedStyles = watch("trading_style_preferences") ?? [];
	const { isAuthed, isLoading: authLoading } = useAuth();

	const toggleStyle = (value: z.infer<typeof tradingStyleValueEnum>) => {
		const next = new Set(selectedStyles);
		if (next.has(value)) next.delete(value);
		else if (next.size >= 3) return;
		else next.add(value);
		setValue("trading_style_preferences", Array.from(next), {
			shouldValidate: true,
			shouldDirty: true,
		});
		setFieldErrors((prev) => ({ ...prev, trading_style_preferences: undefined }));
	};

	useEffect(() => {
		if (authLoading) return;
		if (!isAuthed) {
			router.replace("/login");
			return;
		}

		let alive = true;
		async function run() {
			const sb = getSupabaseBrowserClient();
			if (!sb) {
				setLoading(false);
				toast.error(t("errors.supabaseMissing"));
				return;
			}
			const { data: userRes } = await sb.auth.getUser();
			const user = userRes.user;
			if (!user) {
				router.replace("/login");
				return;
			}
			const uid = user.id;
			const meta = user.user_metadata as Record<string, unknown> | undefined;
			const nickFromAuth = resolveNicknameFromMetadata(meta, "学员");

			const { data, error } = await sb
				.from("profiles")
				.select("nickname")
				.eq("id", uid)
				.maybeSingle();

			if (!alive) return;
			if (error) {
				console.warn("[enroll profiles]", error.message);
			}

			const emailAddr = (user.email ?? "").trim();
			if (!emailAddr) {
				setLoading(false);
				toast.error(tEnroll("needLogin"));
				router.replace("/login");
				return;
			}

			const nickname =
				(data?.nickname != null && String(data.nickname).trim()) || nickFromAuth;

			setProfile({
				nickname: nickname || "—",
				email: emailAddr,
			});
			setLoading(false);
		}
		run();
		return () => {
			alive = false;
		};
	}, [authLoading, isAuthed, router, t, tEnroll]);

	const onSubmit = async (raw: RegistrationFormValues) => {
		const parsed = schema.safeParse({
			real_name: raw.real_name,
			phone: raw.phone,
			trading_experience: raw.trading_experience,
			trading_style_preferences: raw.trading_style_preferences,
			learning_goals: raw.learning_goals,
			willing_to_recommend: raw.willing_to_recommend,
		});
		setFieldErrors({});
		if (!parsed.success) {
			const flat = parsed.error.flatten().fieldErrors;
			setFieldErrors({
				trading_experience: flat.trading_experience?.[0],
				trading_style_preferences: flat.trading_style_preferences?.[0],
				willing_to_recommend: flat.willing_to_recommend?.[0],
			});
			return;
		}

		const res = await fetch("/api/enroll", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({
				real_name: parsed.data.real_name?.trim() || undefined,
				phone: parsed.data.phone?.trim() || undefined,
				trading_experience: parsed.data.trading_experience,
				trading_style_preferences: parsed.data.trading_style_preferences,
				learning_goals: parsed.data.learning_goals?.trim() || undefined,
				willing_to_recommend: parsed.data.willing_to_recommend === "yes",
			}),
		});
		const js = (await res.json()) as { success?: boolean; error?: string };

		if (!res.ok || !js.success) {
			toast.error(typeof js.error === "string" ? js.error : t("errors.submitFailed"));
			return;
		}
		toast.success(tEnroll("success"));
		router.push("/my-learning");
	};

	if (loading) {
		return (
			<div className="flex justify-center py-16">
				<Loader2 className="size-8 animate-spin text-cyan-400/70" />
			</div>
		);
	}

	if (!profile) {
		return <p className="text-muted-foreground text-center text-sm">{tEnroll("needLogin")}</p>;
	}

	return (
		<>
			<form
				onSubmit={handleSubmit(onSubmit)}
				className="border-border/80 bg-card/40 mx-auto w-full max-w-lg space-y-6 rounded-xl border p-6 shadow-sm backdrop-blur-sm md:p-8"
				noValidate
			>
				<div className="space-y-1">
					<h1 className="text-xl font-semibold tracking-tight">{tEnroll("title")}</h1>
					<p className="text-muted-foreground text-sm">{tEnroll("intro")}</p>
				</div>

				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-2">
						<Label>{tEnroll("readOnlyNickname")}</Label>
						<Input value={profile.nickname} disabled readOnly className="opacity-90" />
					</div>
					<div className="space-y-2">
						<Label>{tEnroll("readOnlyEmail")}</Label>
						<Input value={profile.email} disabled readOnly className="opacity-90" />
					</div>
				</div>

				<div className="space-y-2">
					<Label htmlFor="real_name">
						{t("realName")}{" "}
						<span className="text-muted-foreground font-normal">{t("realNameHint")}</span>
					</Label>
					<Input id="real_name" type="text" autoComplete="name" {...register("real_name")} />
				</div>

				<div className="space-y-2">
					<Label htmlFor="phone">
						{t("phone")}{" "}
						<span className="text-muted-foreground font-normal">{t("phoneHint")}</span>
					</Label>
					<Input id="phone" type="tel" autoComplete="tel" {...register("phone")} />
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
						<p className="text-destructive text-xs">{fieldErrors.willing_to_recommend}</p>
					)}
				</fieldset>

				<Button type="submit" disabled={isSubmitting} className="w-full md:w-auto">
					{isSubmitting ? tEnroll("submitting") : tEnroll("submit")}
				</Button>
			</form>
			<Toaster richColors theme="dark" position="top-center" />
		</>
	);
}
