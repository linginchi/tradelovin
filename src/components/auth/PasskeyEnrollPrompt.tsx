"use client";

import { Fingerprint, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast, Toaster } from "sonner";

import { Button } from "@/components/ui/button";
import { enrollDismissStorageKey, classifyPasskeyLoginError, type PasskeyRpId } from "@/lib/auth/passkey";
import {
	fetchPasskeyStatus,
	registerPasskey,
	webAuthnSupported,
} from "@/lib/auth/passkey-browser";
import { useAuth } from "@/lib/auth/use-auth";

function readDismissed(key: string): boolean {
	try {
		return window.localStorage.getItem(key) === "1";
	} catch {
		return false;
	}
}

function writeDismissed(key: string) {
	try {
		window.localStorage.setItem(key, "1");
	} catch {
		// private mode / quota
	}
}

export function PasskeyEnrollPrompt() {
	const t = useTranslations("MagicLogin");
	const { status, user } = useAuth();
	const [rpId, setRpId] = useState<PasskeyRpId | null>(null);
	const [visible, setVisible] = useState(false);
	const [busy, setBusy] = useState(false);

	const refreshEligibility = useCallback(async () => {
		if (status !== "authenticated" || !user) {
			setVisible(false);
			setRpId(null);
			return;
		}
		if (!webAuthnSupported()) {
			setVisible(false);
			return;
		}
		const snapshot = await fetchPasskeyStatus();
		if (!snapshot || snapshot.enrolled) {
			setVisible(false);
			setRpId(snapshot?.rpId ?? null);
			return;
		}
		if (readDismissed(enrollDismissStorageKey(user.userId, snapshot.rpId))) {
			setVisible(false);
			setRpId(snapshot.rpId);
			return;
		}
		setRpId(snapshot.rpId);
		setVisible(true);
	}, [status, user]);

	useEffect(() => {
		void refreshEligibility();
	}, [refreshEligibility]);

	if (status !== "authenticated" || !user) return null;

	const onSkip = () => {
		if (!rpId) return;
		writeDismissed(enrollDismissStorageKey(user.userId, rpId));
		setVisible(false);
	};

	const onEnroll = async () => {
		if (busy) return;
		setBusy(true);
		try {
			await registerPasskey(false);
			toast.success(t("passkeyEnrollSuccess"));
			setVisible(false);
		} catch (error) {
			const kind = classifyPasskeyLoginError(error);
			if (kind === "cancelled") {
				toast.message(t("passkeyCancelled"));
			} else if (kind === "missing_service_role") {
				toast.error(t("passkeyMissingServiceRole"));
			} else {
				toast.error(t("passkeyFailed"));
			}
		} finally {
			setBusy(false);
		}
	};

	return (
		<>
			{visible ? (
				<div className="border-border/80 bg-card/70 border-b px-4 py-3 backdrop-blur-md">
					<div className="mx-auto flex w-full max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div className="min-w-0">
							<p className="text-sm font-medium">{t("passkeyEnrollTitle")}</p>
							<p className="text-muted-foreground text-xs">{t("passkeyEnrollBody")}</p>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							<Button type="button" size="sm" className="gap-1.5" disabled={busy} onClick={() => void onEnroll()}>
								{busy ? (
									<Loader2 className="size-3.5 animate-spin" aria-hidden />
								) : (
									<Fingerprint className="size-3.5" aria-hidden />
								)}
								{t("passkeyEnrollCta")}
							</Button>
							<Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onSkip}>
								{t("passkeyEnrollSkip")}
							</Button>
						</div>
					</div>
				</div>
			) : null}
			<Toaster richColors theme="dark" position="top-center" />
		</>
	);
}
