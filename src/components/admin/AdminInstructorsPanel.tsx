"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
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
import { Textarea } from "@/components/ui/textarea";

type InstructorRow = { id: string; name: string; bio: string | null; specialties: string[] };

export function AdminInstructorsPanel() {
	const t = useTranslations("Admin");
	const [rows, setRows] = useState<InstructorRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [addOpen, setAddOpen] = useState(false);
	const [editRow, setEditRow] = useState<InstructorRow | null>(null);
	const [name, setName] = useState("");
	const [bio, setBio] = useState("");
	const [specialties, setSpecialties] = useState("");
	const [editName, setEditName] = useState("");
	const [editBio, setEditBio] = useState("");
	const [editSpec, setEditSpec] = useState("");
	const [saving, setSaving] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/admin/instructors", { credentials: "include" });
			const data = (await res.json()) as { instructors?: InstructorRow[]; error?: string };
			if (!res.ok) {
				setError(data.error ?? t("loadError"));
				return;
			}
			setRows(data.instructors ?? []);
		} catch {
			setError(t("loadError"));
		} finally {
			setLoading(false);
		}
	}, [t]);

	useEffect(() => {
		void load();
	}, [load]);

	function openAdd() {
		setName("");
		setBio("");
		setSpecialties("");
		setAddOpen(true);
	}

	function openEdit(r: InstructorRow) {
		setEditRow(r);
		setEditName(r.name);
		setEditBio(r.bio ?? "");
		setEditSpec(r.specialties?.join(", ") ?? "");
	}

	async function add() {
		if (!name.trim()) return;
		setSaving(true);
		setError(null);
		const spec = specialties
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		try {
			const res = await fetch("/api/admin/instructors", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ name: name.trim(), bio: bio.trim() || null, specialties: spec }),
			});
			const j = (await res.json()) as { error?: string };
			if (!res.ok) {
				setError(j.error ?? t("saveError"));
				return;
			}
			setAddOpen(false);
			void load();
		} catch {
			setError(t("saveError"));
		} finally {
			setSaving(false);
		}
	}

	async function saveEdit() {
		if (!editRow) return;
		setSaving(true);
		setError(null);
		const spec = editSpec
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		try {
			const res = await fetch(`/api/admin/instructors/${editRow.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					name: editName.trim(),
					bio: editBio.trim() || null,
					specialties: spec,
				}),
			});
			const j = (await res.json()) as { error?: string };
			if (!res.ok) {
				setError(j.error ?? t("saveError"));
				return;
			}
			setEditRow(null);
			void load();
		} catch {
			setError(t("saveError"));
		} finally {
			setSaving(false);
		}
	}

	async function remove(id: string) {
		if (!confirm(t("confirmDelete"))) return;
		await fetch(`/api/admin/instructors/${id}`, { method: "DELETE", credentials: "include" });
		void load();
	}

	return (
		<div className="space-y-6">
			<Card className="border-border/60 bg-card/35">
				<CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
					<div>
						<CardTitle className="text-base">{t("instructorsTitle")}</CardTitle>
						<CardDescription>{t("instructorsSubtitle")}</CardDescription>
					</div>
					<Button type="button" size="sm" onClick={openAdd}>
						{t("addInstructor")}
					</Button>
				</CardHeader>
			</Card>

			{error && <p className="text-destructive text-sm">{error}</p>}

			<div className="rounded-xl border border-border/60 bg-card/25 ring-1 ring-foreground/5">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t("instructorName")}</TableHead>
							<TableHead className="hidden md:table-cell">{t("instructorBio")}</TableHead>
							<TableHead className="hidden sm:table-cell">{t("specialties")}</TableHead>
							<TableHead className="text-right">{t("actions")}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{loading ? (
							<TableRow>
								<TableCell colSpan={4} className="text-muted-foreground py-10 text-center">
									…
								</TableCell>
							</TableRow>
						) : rows.length === 0 ? (
							<TableRow>
								<TableCell colSpan={4} className="text-muted-foreground py-10 text-center">
									{t("empty")}
								</TableCell>
							</TableRow>
						) : (
							rows.map((r) => (
								<TableRow key={r.id}>
									<TableCell className="font-medium">{r.name}</TableCell>
									<TableCell className="text-muted-foreground hidden max-w-xs truncate md:table-cell">
										{r.bio ?? "—"}
									</TableCell>
									<TableCell className="text-muted-foreground hidden text-xs sm:table-cell">
										{r.specialties?.length ? r.specialties.join(" · ") : "—"}
									</TableCell>
									<TableCell className="text-right">
										<div className="flex flex-wrap justify-end gap-1">
											<Button type="button" variant="outline" size="sm" onClick={() => openEdit(r)}>
												{t("edit")}
											</Button>
											<Button
												type="button"
												variant="outline"
												size="sm"
												onClick={() => void remove(r.id)}
											>
												{t("remove")}
											</Button>
										</div>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			<Dialog open={addOpen} onOpenChange={setAddOpen}>
				<DialogContent className="sm:max-w-md" showCloseButton>
					<DialogHeader>
						<DialogTitle>{t("addInstructor")}</DialogTitle>
					</DialogHeader>
					<div className="grid gap-3">
						<div className="space-y-2">
							<Label htmlFor="ins-name">{t("instructorName")}</Label>
							<Input id="ins-name" value={name} onChange={(e) => setName(e.target.value)} className="h-10" />
						</div>
						<div className="space-y-2">
							<Label htmlFor="ins-bio">{t("instructorBio")}</Label>
							<Textarea id="ins-bio" value={bio} onChange={(e) => setBio(e.target.value)} className="min-h-[72px]" />
						</div>
						<div className="space-y-2">
							<Label htmlFor="ins-spec">{t("specialties")}</Label>
							<Input
								id="ins-spec"
								value={specialties}
								onChange={(e) => setSpecialties(e.target.value)}
								placeholder="A, B, C"
								className="h-10"
							/>
						</div>
					</div>
					<DialogFooter className="border-t-0 bg-transparent p-0 sm:justify-end">
						<Button type="button" variant="outline" disabled={saving} onClick={() => setAddOpen(false)}>
							{t("cancel")}
						</Button>
						<Button type="button" disabled={saving || !name.trim()} onClick={() => void add()}>
							{t("save")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={editRow !== null} onOpenChange={(o) => !o && setEditRow(null)}>
				<DialogContent className="sm:max-w-md" showCloseButton>
					<DialogHeader>
						<DialogTitle>{t("edit")}</DialogTitle>
					</DialogHeader>
					<div className="grid gap-3">
						<div className="space-y-2">
							<Label htmlFor="ins-edit-name">{t("instructorName")}</Label>
							<Input
								id="ins-edit-name"
								value={editName}
								onChange={(e) => setEditName(e.target.value)}
								className="h-10"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="ins-edit-bio">{t("instructorBio")}</Label>
							<Textarea
								id="ins-edit-bio"
								value={editBio}
								onChange={(e) => setEditBio(e.target.value)}
								className="min-h-[72px]"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="ins-edit-spec">{t("specialties")}</Label>
							<Input
								id="ins-edit-spec"
								value={editSpec}
								onChange={(e) => setEditSpec(e.target.value)}
								className="h-10"
							/>
						</div>
					</div>
					<DialogFooter className="border-t-0 bg-transparent p-0 sm:justify-end">
						<Button type="button" variant="outline" disabled={saving} onClick={() => setEditRow(null)}>
							{t("cancel")}
						</Button>
						<Button type="button" disabled={saving || !editName.trim()} onClick={() => void saveEdit()}>
							{t("save")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
