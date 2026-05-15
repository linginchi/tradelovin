"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type FormValues = {
	email: string;
	password: string;
};

export function PasswordLoginForm() {
	const searchParams = useSearchParams();
	const t = useTranslations("MagicLogin");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const {
		register,
		handleSubmit,
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
				<Label htmlFor="password-login-password">{t("passwordLabel")}</Label>
				<Input
					id="password-login-password"
					type="password"
					autoComplete="current-password"
					{...register("password", { required: true, minLength: 8 })}
				/>
				{errors.password ? <p className="text-destructive text-xs">{t("passwordRequired")}</p> : null}
			</div>

			<Button type="submit" disabled={busy} className={busy ? "gap-2" : ""}>
				{busy ? (
					<>
						<Loader2 className="size-4 animate-spin" aria-hidden /> {t("passwordLoggingIn")}
					</>
				) : (
					t("passwordLogin")
				)}
			</Button>

			{error ? <p className="text-destructive text-sm">{error}</p> : null}
		</form>
	);
}
