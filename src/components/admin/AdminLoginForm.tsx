"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { ADMIN_BASE_PATH } from "@/lib/admin/paths";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	BOOTSTRAP_SUPER_ADMIN_EMAIL,
	BOOTSTRAP_SUPER_ADMIN_FIXED_OTP,
} from "@/lib/auth/admin-portal-constants";
import { cn } from "@/lib/utils";

export function AdminLoginForm() {
	const t = useTranslations("AdminAuth");
	const router = useRouter();
	const searchParams = useSearchParams();
	const [email, setEmail] = useState("");
	const [code, setCode] = useState("");
	const [phase, setPhase] = useState<"email" | "code">("email");
	const [loading, setLoading] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const showCjkztQuickLogin =
		process.env.NODE_ENV !== "production" ||
		process.env.NEXT_PUBLIC_SHOW_CJKZT_QUICK_LOGIN === "1" ||
		process.env.NEXT_PUBLIC_SHOW_CJKZT_QUICK_LOGIN === "true";

	function safeNext(): string {
		const raw = searchParams.get("next");
		if (raw && raw.startsWith(ADMIN_BASE_PATH)) return raw;
		return ADMIN_BASE_PATH;
	}

	async function sendCode() {
		setError(null);
		setMessage(null);
		setLoading(true);
		try {
			const res = await fetch("/api/admin/auth/send-code", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: email.trim() }),
			});
			const data = (await res.json()) as {
				ok?: boolean;
				error?: string;
				errorZh?: string;
				message?: string;
			};
			if (!res.ok) {
				setError(data.errorZh ?? data.error ?? t("errorGeneric"));
				return;
			}
			setMessage(data.message ?? t("codeSentHint"));
			setPhase("code");
		} catch {
			setError(t("errorGeneric"));
		} finally {
			setLoading(false);
		}
	}

	async function verify() {
		setError(null);
		setMessage(null);
		setLoading(true);
		try {
			const res = await fetch("/api/admin/auth/verify-code", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: email.trim(), code: code.trim() }),
				credentials: "include",
			});
			const data = (await res.json()) as { ok?: boolean; error?: string; errorZh?: string };
			if (!res.ok) {
				setError(data.errorZh ?? data.error ?? t("invalidCode"));
				return;
			}
			router.push(safeNext());
			router.refresh();
		} catch {
			setError(t("errorGeneric"));
		} finally {
			setLoading(false);
		}
	}

	async function quickLoginAsBootstrap() {
		setError(null);
		setMessage(null);
		setLoading(true);
		try {
			const sendRes = await fetch("/api/admin/auth/send-code", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: BOOTSTRAP_SUPER_ADMIN_EMAIL }),
			});
			const sendData = (await sendRes.json()) as { ok?: boolean; error?: string; errorZh?: string };
			if (!sendRes.ok) {
				setError(sendData.errorZh ?? sendData.error ?? t("errorGeneric"));
				return;
			}

			const verifyRes = await fetch("/api/admin/auth/verify-code", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: BOOTSTRAP_SUPER_ADMIN_EMAIL,
					code: BOOTSTRAP_SUPER_ADMIN_FIXED_OTP,
				}),
				credentials: "include",
			});
			const verifyData = (await verifyRes.json()) as { ok?: boolean; error?: string; errorZh?: string };
			if (!verifyRes.ok) {
				setError(verifyData.errorZh ?? verifyData.error ?? t("invalidCode"));
				return;
			}
			router.push(safeNext());
			router.refresh();
		} catch {
			setError(t("errorGeneric"));
		} finally {
			setLoading(false);
		}
	}

	return (
		<Card className="border-border/80 bg-card/45 mx-auto w-full max-w-md shadow-sm backdrop-blur-md">
			<CardHeader>
				<CardTitle className="text-xl">{t("title")}</CardTitle>
				<CardDescription>{t("subtitle")}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				{phase === "email" ? (
					<div className="space-y-3">
						<div className="space-y-2">
							<Label htmlFor="admin-email">{t("emailLabel")}</Label>
							<Input
								id="admin-email"
								type="email"
								autoComplete="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder={t("emailPlaceholder")}
								className="h-10"
							/>
						</div>
						<Button
							type="button"
							className="w-full"
							disabled={loading || !email.trim()}
							onClick={() => void sendCode()}
						>
							{loading ? t("sending") : t("sendCode")}
						</Button>
					</div>
				) : (
					<div className="space-y-3">
						<p className="text-muted-foreground text-sm">{t("codeHint", { email: email.trim() })}</p>
						<div className="space-y-2">
							<Label htmlFor="admin-code">{t("codeLabel")}</Label>
							<Input
								id="admin-code"
								inputMode="numeric"
								autoComplete="one-time-code"
								maxLength={6}
								value={code}
								onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
								placeholder="000000"
								className="h-11 font-mono text-lg tracking-widest"
							/>
						</div>
						<div className="flex flex-wrap gap-2">
							<Button
								type="button"
								className="min-w-0 flex-1"
								disabled={loading || code.length !== 6}
								onClick={() => void verify()}
							>
								{loading ? t("verifying") : t("verify")}
							</Button>
							<Button
								type="button"
								variant="outline"
								disabled={loading}
								onClick={() => {
									setPhase("email");
									setCode("");
									setMessage(null);
								}}
							>
								{t("back")}
							</Button>
						</div>
					</div>
				)}

				{message && <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}
				{error && <p className="text-destructive text-sm">{error}</p>}

				{showCjkztQuickLogin ? (
					<div className="border-border/60 space-y-2 rounded-md border border-dashed p-3">
						<p className="text-muted-foreground text-xs">{t("quickLoginHint")}</p>
						<Button
							type="button"
							variant="secondary"
							className="w-full"
							disabled={loading}
							onClick={() => void quickLoginAsBootstrap()}
						>
							{loading ? t("verifying") : t("quickLogin")}
						</Button>
					</div>
				) : null}

				<p className="text-center text-sm">
					<Link href="/" className={cn("text-cyan-300 underline-offset-4 hover:underline")}>
						{t("backSite")}
					</Link>
				</p>
			</CardContent>
		</Card>
	);
}
