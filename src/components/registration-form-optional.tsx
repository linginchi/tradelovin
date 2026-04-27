"use client";

import type { UseFormRegister } from "react-hook-form";
import { useTranslations } from "next-intl";

import type { RegistrationFormValues } from "@/components/registration-form";

export default function RegistrationFormOptionalFields({
	register,
}: {
	register: UseFormRegister<RegistrationFormValues>;
}) {
	const t = useTranslations("Registration");

	return (
		<div className="space-y-2">
			<label className="text-sm font-medium" htmlFor="learning_goals">
				{t("learningGoals")}{" "}
				<span className="text-muted-foreground font-normal">{t("learningGoalsHint")}</span>
			</label>
			<textarea
				id="learning_goals"
				rows={4}
				className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[100px] w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
				placeholder={t("learningGoalsPlaceholder")}
				{...register("learning_goals")}
			/>
		</div>
	);
}
