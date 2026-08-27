"use client";

import { Fingerprint, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { classifyPasskeyLoginError } from "@/lib/auth/passkey";
import { loginWithPasskey, webAuthnSupported } from "@/lib/auth/passkey-browser";

export function PasskeyLoginButton() {
	const t = useTranslations("MagicLogin");
	const searchParams = useSearchParams();
	const [supported, setSupported] = useState(false);
	const [busy, setBusy] = useState(false);

	const nextParam = searchParams.get("next");
	const nextPath =
		nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
			? nextParam
			: "/my-learning";

	useEffect(() => {
		setSupported(webAuthnSupported());
	}, []);

	if (!supported) return null;

	const onLogin = async () => {
		if (busy) return;
		setBusy(true);
		try {
			const redirectTo = await loginWithPasskey(nextPath);
			window.location.assign(redirectTo);
		} catch (error) {
			const kind = classifyPasskeyLoginError(error);
			if (kind === "cancelled") {
				toast.message(t("passkeyCancelled"));
			} else if (kind === "needs_enroll") {
				toast.error(t("passkeyNeedsEnroll"));
			} else if (kind === "missing_service_role") {
				toast.error(t("passkeyMissingServiceRole"));
			} else {
				toast.error(t("passkeyFailed"));
			}
			setBusy(false);
		}
	};

	return (
		<div className="space-y-2">
			<Button
				type="button"
				className="w-full gap-2"
				size="lg"
				disabled={busy}
				onClick={() => void onLogin()}
			>
				{busy ? (
					<Loader2 className="size-4 animate-spin" aria-hidden />
				) : (
					<Fingerprint className="size-4" aria-hidden />
				)}
				{busy ? t("passkeyLoggingIn") : t("passkeyLogin")}
			</Button>
			<p className="text-muted-foreground text-xs">{t("passkeyLoginHint")}</p>
		</div>
	);
}
