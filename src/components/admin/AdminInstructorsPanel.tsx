"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

type InstructorRow = {
	id: string;
	name: string;
	email: string | null;
	avatar_url: string | null;
	bio: string | null;
	is_coach: boolean;
};

type CourseRow = {
	id: string;
	title: string;
	instructor_id: string | null;
};

export function AdminInstructorsPanel() {
	const t = useTranslations("Admin");
	const [rows, setRows] = useState<InstructorRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [addOpen, setAddOpen] = useState(false);
	const [editRow, setEditRow] = useState<InstructorRow | null>(null);
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [bio, setBio] = useState("");
	const [editName, setEditName] = useState("");
	const [editEmail, setEditEmail] = useState("");
	const [editBio, setEditBio] = useState("");
	const [saving, setSaving] = useState(false);
	const [assignFor, setAssignFor] = useState<InstructorRow | null>(null);
	const [courses, setCourses] = useState<CourseRow[]>([]);
	const [coursePick, setCoursePick] = useState<Set<string>>(new Set());
	const [coachEmail, setCoachEmail] = useState("");

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
		const timer = window.setTimeout(() => {
			void load();
		}, 0);
		return () => window.clearTimeout(timer);
	}, [load]);

	function openAdd() {
		setName("");
		setEmail("");
		setBio("");
		setAddOpen(true);
	}

	function openEdit(r: InstructorRow) {
		setEditRow(r);
		setEditName(r.name);
		setEditEmail(r.email ?? "");
		setEditBio(r.bio ?? "");
	}

	async function openAssign(r: InstructorRow) {
		setAssignFor(r);
		setError(null);
		const res = await fetch("/api/admin/courses", { credentials: "include" });
		const data = (await res.json()) as { courses?: CourseRow[]; error?: string };
		if (!res.ok) {
			setError(data.error ?? t("loadError"));
			setAssignFor(null);
			return;
		}
		const list = (data.courses ?? []).map((c) => ({
			id: c.id,
			title: c.title,
			instructor_id: (c as { instructor_id?: string | null }).instructor_id ?? null,
		}));
		setCourses(list);
		const initial = new Set(list.filter((c) => c.instructor_id === r.id).map((c) => c.id));
		setCoursePick(initial);
	}

	async function toggleCoach(row: InstructorRow, next: boolean) {
		setSaving(true);
		setError(null);
		try {
			const res = await fetch(`/api/admin/instructors/${row.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ is_coach: next }),
			});
			const j = (await res.json()) as { error?: string };
			if (!res.ok) {
				setError(j.error ?? t("saveError"));
				return;
			}
			void load();
		} catch {
			setError(t("saveError"));
		} finally {
			setSaving(false);
		}
	}

	async function appointCoachByEmail() {
		if (!coachEmail.trim()) return;
		setSaving(true);
		setError(null);
		try {
			const res = await fetch("/api/admin/coaches", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ email: coachEmail.trim().toLowerCase(), isCoach: true }),
			});
			const j = (await res.json()) as { error?: string };
			if (!res.ok) {
				setError(j.error ?? t("saveError"));
				return;
			}
			setCoachEmail("");
			void load();
		} catch {
			setError(t("saveError"));
		} finally {
			setSaving(false);
		}
	}

	function toggleCourse(cid: string) {
		setCoursePick((prev) => {
			const next = new Set(prev);
			if (next.has(cid)) next.delete(cid);
			else next.add(cid);
			return next;
		});
	}

	async function saveAssignments() {
		if (!assignFor) return;
		setSaving(true);
		setError(null);
		try {
			for (const c of courses) {
				const want = coursePick.has(c.id);
				const is = c.instructor_id === assignFor.id;
				if (want === is) continue;
				const res = await fetch(`/api/admin/courses/${c.id}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					credentials: "include",
					body: JSON.stringify({
						instructor_id: want ? assignFor.id : null,
					}),
				});
				const j = (await res.json()) as { error?: string };
				if (!res.ok) {
					setError(j.error ?? t("saveError"));
					setSaving(false);
					return;
				}
			}
			setAssignFor(null);
		} catch {
			setError(t("saveError"));
		} finally {
			setSaving(false);
		}
	}

	async function add() {
		if (!name.trim()) return;
		setSaving(true);
		setError(null);
		try {
			const res = await fetch("/api/admin/instructors", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					name: name.trim(),
					email: email.trim().toLowerCase(),
					bio: bio.trim() || null,
				}),
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
		try {
			const res = await fetch(`/api/admin/instructors/${editRow.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					name: editName.trim(),
					email: editEmail.trim() ? editEmail.trim().toLowerCase() : null,
					bio: editBio.trim() || null,
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

			<div className="flex flex-wrap items-end gap-2 rounded-xl border border-border/60 bg-card/25 p-3">
				<div className="min-w-56 flex-1 space-y-1">
					<Label htmlFor="appoint-coach-email">任命现有账号为金钱豹教练</Label>
					<Input
						id="appoint-coach-email"
						type="email"
						value={coachEmail}
						onChange={(e) => setCoachEmail(e.target.value)}
						placeholder="学员或讲师邮箱"
					/>
				</div>
				<Button type="button" variant="outline" disabled={saving || !coachEmail.trim()} onClick={() => void appointCoachByEmail()}>
					任命教练
				</Button>
				<p className="text-muted-foreground w-full text-xs">
					只任命身份，不审批额度。日常库存、审核与发放都在考核盘「资源」栏完成。教练需有效 T3 会员。
				</p>
			</div>

			{error && <p className="text-destructive text-sm">{error}</p>}

			<div className="rounded-xl border border-border/60 bg-card/25 ring-1 ring-foreground/5 overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-12">{t("colAvatar")}</TableHead>
							<TableHead>{t("instructorName")}</TableHead>
							<TableHead className="hidden md:table-cell">{t("instructorEmail")}</TableHead>
							<TableHead className="hidden md:table-cell">{t("instructorBio")}</TableHead>
							<TableHead>金钱豹教练</TableHead>
							<TableHead className="text-right">{t("actions")}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{loading ? (
							<TableRow>
								<TableCell colSpan={6} className="text-muted-foreground py-10 text-center">
									?
								</TableCell>
							</TableRow>
						) : rows.length === 0 ? (
							<TableRow>
								<TableCell colSpan={6} className="text-muted-foreground py-10 text-center">
									{t("empty")}
								</TableCell>
							</TableRow>
						) : (
							rows.map((r) => (
								<TableRow key={r.id}>
									<TableCell>
										{r.avatar_url ? (
											<Image
												src={r.avatar_url}
												alt=""
												width={32}
												height={32}
												className="size-8 rounded-full object-cover ring-1 ring-border"
												sizes="32px"
											/>
										) : (
											<span className="text-muted-foreground text-xs">�</span>
										)}
									</TableCell>
									<TableCell className="font-medium">{r.name}</TableCell>
									<TableCell className="hidden font-mono text-xs md:table-cell">{r.email ?? "�"}</TableCell>
									<TableCell className="text-muted-foreground hidden max-w-xs truncate md:table-cell">
										{r.bio ?? "�"}
									</TableCell>
									<TableCell>
										<label className="flex items-center gap-2 text-sm">
											<Checkbox
												checked={r.is_coach}
												onCheckedChange={(checked) => void toggleCoach(r, Boolean(checked))}
											/>
											{r.is_coach ? "已任命" : "未任命"}
										</label>
									</TableCell>
									<TableCell className="text-right">
										<div className="flex flex-wrap justify-end gap-1">
											<Button type="button" variant="outline" size="sm" onClick={() => void openAssign(r)}>
												{t("assignCourses")}
											</Button>
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
							<Label htmlFor="ins-email">{t("instructorEmail")}</Label>
							<Input
								id="ins-email"
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								className="h-10"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="ins-bio">{t("instructorBio")}</Label>
							<Textarea id="ins-bio" value={bio} onChange={(e) => setBio(e.target.value)} className="min-h-[72px]" />
						</div>
					</div>
					<DialogFooter className="border-t-0 bg-transparent p-0 sm:justify-end">
						<Button type="button" variant="outline" disabled={saving} onClick={() => setAddOpen(false)}>
							{t("cancel")}
						</Button>
						<Button
							type="button"
							disabled={saving || !name.trim() || !email.trim()}
							onClick={() => void add()}
						>
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
							<Label htmlFor="ins-edit-email">{t("instructorEmail")}</Label>
							<Input
								id="ins-edit-email"
								type="email"
								value={editEmail}
								onChange={(e) => setEditEmail(e.target.value)}
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

			<Dialog open={assignFor !== null} onOpenChange={(o) => !o && setAssignFor(null)}>
				<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg" showCloseButton>
					<DialogHeader>
						<DialogTitle>{t("assignCourses")}</DialogTitle>
					</DialogHeader>
					<div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
						{courses.map((c) => (
							<label
								key={c.id}
								className="border-border/60 flex cursor-pointer items-start gap-3 rounded-lg border p-3"
							>
								<Checkbox
									checked={coursePick.has(c.id)}
									onCheckedChange={() => toggleCourse(c.id)}
									aria-label={c.title}
								/>
								<div className="min-w-0">
									<p className="text-sm font-medium">{c.title}</p>
									{c.instructor_id && c.instructor_id !== assignFor?.id ? (
										<p className="text-muted-foreground text-xs">{t("colInstructor")}: ???</p>
									) : null}
								</div>
							</label>
						))}
					</div>
					<DialogFooter className="border-t-0 bg-transparent p-0 sm:justify-end">
						<Button type="button" variant="outline" disabled={saving} onClick={() => setAssignFor(null)}>
							{t("cancel")}
						</Button>
						<Button type="button" disabled={saving} onClick={() => void saveAssignments()}>
							{t("saveCoursesAssignment")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
