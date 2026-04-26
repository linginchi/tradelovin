"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

type AdminRow = {
	email: string;
	role: string;
	created_at: string;
	created_by: string | null;
};

export function AdminAdminsPanel() {
	const t = useTranslations("Admin");
	const [admins, setAdmins] = useState<AdminRow[]>([]);
	const [email, setEmail] = useState("");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [removeTarget, setRemoveTarget] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/admin/admins", { credentials: "include" });
			const data = (await res.json()) as { admins?: AdminRow[]; error?: string };
			if (!res.ok) {
				setError(data.error ?? t("loadError"));
				return;
			}
			setAdmins(data.admins ?? []);
		} catch {
			setError(t("loadError"));
		} finally {
			setLoading(false);
		}
	}, [t]);

	useEffect(() => {
		void load();
	}, [load]);

	async function addAdmin() {
		setBusy(true);
		setError(null);
		try {
			const res = await fetch("/api/admin/admins", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ email: email.trim() }),
			});
			const data = (await res.json()) as { error?: string };
			if (!res.ok) {
				setError(data.error ?? t("saveError"));
				return;
			}
			setEmail("");
			void load();
		} catch {
			setError(t("saveError"));
		} finally {
			setBusy(false);
		}
	}

	async function removeAdmin(target: string) {
		setBusy(true);
		setError(null);
		setRemoveTarget(null);
		try {
			const res = await fetch(`/api/admin/admins?email=${encodeURIComponent(target)}`, {
				method: "DELETE",
				credentials: "include",
			});
			const data = (await res.json()) as { error?: string };
			if (!res.ok) {
				setError(data.error ?? t("saveError"));
				return;
			}
			void load();
		} catch {
			setError(t("saveError"));
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="space-y-6">
			<Card className="border-border/60 bg-card/35">
				<CardHeader>
					<CardTitle className="text-base">{t("inviteTitle")}</CardTitle>
					<CardDescription>{t("inviteSubtitle")}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
					<div className="min-w-0 flex-1 space-y-2">
						<Label htmlFor="admin-invite-email">{t("adminEmail")}</Label>
						<Input
							id="admin-invite-email"
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="name@company.com"
							className="h-10"
						/>
					</div>
					<Button type="button" disabled={busy || !email.trim()} onClick={() => void addAdmin()}>
						{t("addAdmin")}
					</Button>
				</CardContent>
			</Card>

			{error && <p className="text-destructive text-sm">{error}</p>}

			<div className="rounded-xl border border-border/60 bg-card/25 ring-1 ring-foreground/5">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t("adminEmail")}</TableHead>
							<TableHead>{t("colStatus")}</TableHead>
							<TableHead className="text-right">{t("actions")}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{loading ? (
							<TableRow>
								<TableCell colSpan={3} className="text-muted-foreground py-10 text-center">
									…
								</TableCell>
							</TableRow>
						) : (
							admins.map((a) => (
								<TableRow key={a.email}>
									<TableCell className="font-mono text-xs">{a.email}</TableCell>
									<TableCell>
										{a.role === "super_admin" ? t("roleSuper") : t("roleAdmin")}
									</TableCell>
									<TableCell className="text-right">
										<Button
											type="button"
											variant="outline"
											size="sm"
											disabled={busy}
											onClick={() => setRemoveTarget(a.email)}
										>
											{t("remove")}
										</Button>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			<Dialog open={removeTarget !== null} onOpenChange={(o) => !o && setRemoveTarget(null)}>
				<DialogContent className="sm:max-w-md" showCloseButton>
					<DialogHeader>
						<DialogTitle>{t("confirmRemoveTitle")}</DialogTitle>
						<DialogDescription>
							{removeTarget ? t("confirmRemoveBody", { email: removeTarget }) : ""}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="gap-2 border-t-0 bg-transparent p-0 sm:justify-end">
						<Button type="button" variant="outline" disabled={busy} onClick={() => setRemoveTarget(null)}>
							{t("cancel")}
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={busy || !removeTarget}
							onClick={() => removeTarget && void removeAdmin(removeTarget)}
						>
							{t("remove")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
