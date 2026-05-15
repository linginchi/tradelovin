"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type FormValues = {
	password: string;
	confirmPassword: string;
};

export function ProfilePasswordSection() {
	const t = useTranslations("MyProfile");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const {
		register,
		handleSubmit,
		formState: { errors },
		reset,
	} = useForm<FormValues>({
		defaultValues: { password: "", confirmPassword: "" },
		mode: "onBlur",
	});

	const updatePassword = async (values: FormValues) => {
		setMessage(null);
		setError(null);
		if (values.password !== values.confirmPassword) {
			setError(t("passwordMismatch"));
			return;
		}
		setBusy(true);
		try {
			const sb = getSupabaseBrowserClient();
			if (!sb) {
				setError(t("passwordUpdateFailed"));
				return;
			}
			const { error: updateError } = await sb.auth.updateUser({
				password: values.password,
			});
			if (updateError) {
				setError(t("passwordUpdateFailed"));
				return;
			}
			reset();
			setMessage(t("passwordUpdated"));
		} catch {
			setError(t("passwordUpdateFailed"));
		} finally {
			setBusy(false);
		}
	};

	return (
		<section className="border-border/80 bg-card/35 mb-6 rounded-2xl border p-6 backdrop-blur-md md:p-8">
			<h2 className="text-base font-semibold tracking-tight">{t("passwordSectionTitle")}</h2>
			<p className="text-muted-foreground mt-2 text-sm">{t("passwordSectionSubtitle")}</p>
			<form className="mt-4 space-y-4" onSubmit={handleSubmit(updatePassword)} noValidate>
				<div className="space-y-2">
					<Label htmlFor="profile-password">{t("newPasswordLabel")}</Label>
					<Input
						id="profile-password"
						type="password"
						autoComplete="new-password"
						{...register("password", { required: true, minLength: 8 })}
					/>
					{errors.password ? <p className="text-destructive text-xs">{t("passwordRequired")}</p> : null}
				</div>
				<div className="space-y-2">
					<Label htmlFor="profile-password-confirm">{t("confirmPasswordLabel")}</Label>
					<Input
						id="profile-password-confirm"
						type="password"
						autoComplete="new-password"
						{...register("confirmPassword", { required: true, minLength: 8 })}
					/>
					{errors.confirmPassword ? (
						<p className="text-destructive text-xs">{t("passwordRequired")}</p>
					) : null}
				</div>
				<Button type="submit" disabled={busy} className={busy ? "gap-2" : ""}>
					{busy ? (
						<>
							<Loader2 className="size-4 animate-spin" aria-hidden /> {t("passwordUpdating")}
						</>
					) : (
						t("passwordSave")
					)}
				</Button>
			</form>
			{message ? <p className="mt-3 text-sm text-emerald-500">{message}</p> : null}
			{error ? <p className="text-destructive mt-3 text-sm">{error}</p> : null}
		</section>
	);
}
