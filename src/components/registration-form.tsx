"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export const TRADING_STYLE_OPTIONS = [
	{
		value: "trend_following",
		label: "趋势追踪",
		description: "顺势而为，捕捉日内单边行情",
	},
	{
		value: "reversal",
		label: "反转策略",
		description: "寻找超买超卖区域的拐点机会",
	},
	{
		value: "breakout",
		label: "突破交易",
		description: "关键价格区间突破时跟进",
	},
	{
		value: "range_bound",
		label: "区间震荡",
		description: "压力支撑位之间高抛低吸",
	},
	{
		value: "scalping",
		label: "高频/剥头皮",
		description: "快速进出，赚取微小价差",
	},
	{
		value: "order_book",
		label: "盘口分析",
		description: "基于订单流和盘口数据的决策",
	},
	{
		value: "quant",
		label: "量化/程序化",
		description: "用代码和模型辅助交易决策",
	},
	{
		value: "undecided",
		label: "还不确定",
		description: "暂时没有明确偏好",
	},
] as const;

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

const recommendValues = ["yes", "no", "later"] as const;

const registrationSchema = z.object({
	real_name: z.string().optional(),
	nickname: z.string().min(1, "请填写昵称（将用于站内展示）"),
	email: z.string().min(1, "请填写邮箱").email("请输入有效邮箱"),
	phone: z.string().optional(),
	trading_experience: z.enum(experienceValues),
	trading_style_preferences: z
		.array(tradingStyleValueEnum)
		.max(3, "最多选择 3 项"),
	learning_goals: z.string().optional(),
	willing_to_recommend: z.enum(recommendValues),
});

export type RegistrationFormValues = z.infer<typeof registrationSchema>;

const experienceLabels: Record<(typeof experienceValues)[number], string> = {
	none: "无实盘经验",
	lt_1y: "少于 1 年",
	y1_3: "1–3 年",
	gt_3: "3 年以上",
	professional: "从业 / 相关专业背景",
};

const recommendLabels: Record<(typeof recommendValues)[number], string> = {
	yes: "愿意",
	no: "不愿意",
	later: "再考虑",
};

export function RegistrationForm() {
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [submitOk, setSubmitOk] = useState(false);
	const [fieldErrors, setFieldErrors] = useState<
		Partial<Record<keyof RegistrationFormValues, string>>
	>({});

	const defaultValues = useMemo<RegistrationFormValues>(
		() => ({
			real_name: "",
			nickname: "",
			email: "",
			phone: "",
			trading_experience: "none",
			trading_style_preferences: [],
			learning_goals: "",
			willing_to_recommend: "later",
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

	const toggleStyle = (value: (typeof TRADING_STYLE_OPTIONS)[number]["value"]) => {
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

		const supabase = getSupabaseBrowserClient();
		if (!supabase) {
			setSubmitError(
				"未配置 Supabase：请在环境变量中设置 NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_ANON_KEY。",
			);
			return;
		}

		const row = {
			real_name: parsed.data.real_name?.trim() || null,
			nickname: parsed.data.nickname.trim(),
			email: parsed.data.email.trim().toLowerCase(),
			phone: parsed.data.phone?.trim() || null,
			trading_experience: parsed.data.trading_experience,
			trading_style_preferences: parsed.data.trading_style_preferences,
			learning_goals: parsed.data.learning_goals?.trim() || null,
			willing_to_recommend: parsed.data.willing_to_recommend,
		};

		const { error } = await supabase.from("registrations").insert(row);

		if (error) {
			setSubmitError(
				error.message ||
					"提交失败。请确认 Supabase 已创建表 registrations，且列与类型匹配。",
			);
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
				<h1 className="text-xl font-semibold tracking-tight">课程报名</h1>
				<p className="text-muted-foreground text-sm">
					填写信息后我们会与你联系。标 * 为必填。
				</p>
			</div>

			<div className="space-y-2">
				<label className="text-sm font-medium" htmlFor="real_name">
					真实姓名{" "}
					<span className="text-muted-foreground font-normal">（选填，鼓励填写）</span>
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
					昵称 <span className="text-destructive">*</span>
					<span className="text-muted-foreground font-normal">（站内显示）</span>
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
					邮箱 <span className="text-destructive">*</span>
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
					手机号{" "}
					<span className="text-muted-foreground font-normal">（选填）</span>
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
					交易经验 <span className="text-destructive">*</span>
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
							{experienceLabels[v]}
						</label>
					))}
				</div>
				{fieldErrors.trading_experience && (
					<p className="text-destructive text-xs">{fieldErrors.trading_experience}</p>
				)}
			</fieldset>

			<fieldset className="space-y-3">
				<legend className="text-sm font-medium">
					交易风格偏好{" "}
					<span className="text-muted-foreground font-normal">
						（多选，选填；最多 3 项）
					</span>
				</legend>
				<p className="text-muted-foreground text-xs">
					日内交易专项策略：已选 {selectedStyles.length} / 3，最多可选 3 项。
				</p>
				<div className="flex flex-col gap-2">
					{TRADING_STYLE_OPTIONS.map((opt) => {
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

			<div className="space-y-2">
				<label className="text-sm font-medium" htmlFor="learning_goals">
					学习目标{" "}
					<span className="text-muted-foreground font-normal">（选填）</span>
				</label>
				<textarea
					id="learning_goals"
					rows={4}
					className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[100px] w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
					placeholder="例如：希望三个月内建立稳定的日内复盘习惯……"
					{...register("learning_goals")}
				/>
			</div>

			<fieldset className="space-y-3">
				<legend className="text-sm font-medium">
					是否愿意被推荐相关课程 / 活动 <span className="text-destructive">*</span>
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
							{recommendLabels[v]}
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
				<p className="text-sm text-emerald-600 dark:text-emerald-400">
					提交成功，感谢报名！
				</p>
			)}

			<Button type="submit" disabled={isSubmitting} className="w-full md:w-auto">
				{isSubmitting ? "提交中…" : "提交报名"}
			</Button>
		</form>
	);
}
