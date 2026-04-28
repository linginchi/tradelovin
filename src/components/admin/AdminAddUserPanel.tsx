"use client";

import { type FormEvent, useState } from "react";
import { useTranslations } from "next-intl";

import { adminFetch } from "@/lib/admin/client-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AdminAddUserPanel() {
	const t = useTranslations("Admin");
	const [email, setEmail] = useState("");
	const [nickname, setNickname] = useState("");
	const [realName, setRealName] = useState("");
	const [phone, setPhone] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [ok, setOk] = useState<string | null>(null);

	async function onSubmit(e: FormEvent) {
		e.preventDefault();
		setError(null);
		setOk(null);
		if (!email.trim() || !nickname.trim()) {
			setError(t("addUserValidation"));
			return;
		}
		setSaving(true);
		try {
			const res = await adminFetch("/api/admin/add-user", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: email.trim().toLowerCase(),
					nickname: nickname.trim(),
					realName: realName.trim() || undefined,
					phone: phone.trim() || undefined,
				}),
			});
			const data = (await res.json()) as { success?: boolean; error?: string; message?: string; code?: string };
			if (!res.ok) {
				if (data.code === "EMAIL_TAKEN") {
					setError(t("addUserEmailExists"));
				} else {
					setError(data.error ?? t("addUserError"));
				}
				return;
			}
			setOk(data.message ?? t("addUserSuccess"));
			setEmail("");
			setNickname("");
			setRealName("");
			setPhone("");
		} catch {
			setError(t("addUserError"));
		} finally {
			setSaving(false);
		}
	}

	return (
		<form onSubmit={(e) => void onSubmit(e)} className="border-border/60 bg-card/30 max-w-md space-y-4 rounded-xl border p-6">
			<div className="space-y-2">
				<Label htmlFor="add-user-email">{t("addUserEmail")}</Label>
				<Input
					id="add-user-email"
					type="email"
					autoComplete="off"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					className="h-10"
					required
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="add-user-nickname">{t("addUserNickname")}</Label>
				<Input
					id="add-user-nickname"
					value={nickname}
					onChange={(e) => setNickname(e.target.value)}
					className="h-10"
					required
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="add-user-real">{t("addUserRealName")}</Label>
				<Input id="add-user-real" value={realName} onChange={(e) => setRealName(e.target.value)} className="h-10" />
			</div>
			<div className="space-y-2">
				<Label htmlFor="add-user-phone">{t("addUserPhone")}</Label>
				<Input id="add-user-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-10" />
			</div>
			{error ? <p className="text-destructive text-sm">{error}</p> : null}
			{ok ? <p className="text-emerald-600 text-sm dark:text-emerald-400">{ok}</p> : null}
			<Button type="submit" disabled={saving}>
				{saving ? "…" : t("addUserSubmit")}
			</Button>
		</form>
	);
}
