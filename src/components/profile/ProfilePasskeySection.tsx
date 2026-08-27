"use client";

import { Fingerprint, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { classifyPasskeyLoginError } from "@/lib/auth/passkey";
import {
	fetchPasskeyStatus,
	registerPasskey,
	webAuthnSupported,
} from "@/lib/auth/passkey-browser";

export function ProfilePasskeySection() {
	const t = useTranslations("MyProfile");
	const tLogin = useTranslations("MagicLogin");
	const [supported, setSupported] = useState(false);
	const [enrolled, setEnrolled] = useState(false);
	const [ready, setReady] = useState(false);
	const [busy, setBusy] = useState(false);

	const refresh = useCallback(async () => {
		if (!webAuthnSupported()) {
			setSupported(false);
			setReady(true);
			return;
		}
		setSupported(true);
		const snapshot = await fetchPasskeyStatus();
		setEnrolled(snapshot?.enrolled === true);
		setReady(true);
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	if (!ready || !supported) return null;

	const onBind = async (replace: boolean) => {
		if (busy) return;
		setBusy(true);
		try {
			await registerPasskey(replace);
			setEnrolled(true);
			toast.success(tLogin("passkeyEnrollSuccess"));
		} catch (error) {
			const kind = classifyPasskeyLoginError(error);
			if (kind === "cancelled") {
				toast.message(tLogin("passkeyCancelled"));
			} else if (kind === "missing_service_role") {
				toast.error(tLogin("passkeyMissingServiceRole"));
			} else {
				toast.error(tLogin("passkeyFailed"));
			}
		} finally {
			setBusy(false);
		}
	};

	return (
		<section className="border-border/80 bg-card/35 mb-6 rounded-2xl border p-6 backdrop-blur-md md:p-8">
			<h2 className="text-base font-semibold tracking-tight">{t("passkeySectionTitle")}</h2>
			{enrolled ? (
				<p className="text-muted-foreground mt-2 text-sm">
					{t("passkeyBound")} · {t("passkeyRebind")}
				</p>
			) : (
				<p className="text-muted-foreground mt-2 text-sm">{tLogin("passkeyEnrollBody")}</p>
			)}
			<div className="mt-4">
				<Button
					type="button"
					className="gap-2"
					disabled={busy}
					onClick={() => void onBind(enrolled)}
				>
					{busy ? (
						<Loader2 className="size-4 animate-spin" aria-hidden />
					) : (
						<Fingerprint className="size-4" aria-hidden />
					)}
					{enrolled ? t("passkeyRebind") : t("passkeyBind")}
				</Button>
			</div>
		</section>
	);
}
