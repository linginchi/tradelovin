"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";

type SessionRow = {
	id: string;
	course_id: string;
	date: string;
	start_time: string;
	end_time: string;
	location: string | null;
};

type InstructorRow = { id: string; name: string; bio: string | null; specialties: string[] };

type RosterRow = {
	id: string;
	student_id: string;
	nickname: string | null;
	email: string;
};

type EnrollRow = {
	id: string;
	student_record_id: string;
	student: { student_id: string; nickname: string | null; email: string } | null;
};

type CourseRow = {
	id: string;
	title: string;
	description: string | null;
	mode: string;
	capacity: number;
};

export function AdminCourseDetailClient({ courseId }: { courseId: string }) {
	const t = useTranslations("Admin");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [course, setCourse] = useState<CourseRow | null>(null);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [mode, setMode] = useState<"online" | "offline">("online");
	const [capacity, setCapacity] = useState(30);
	const [instructorId, setInstructorId] = useState<string>("");
	const [sessions, setSessions] = useState<SessionRow[]>([]);
	const [allInstructors, setAllInstructors] = useState<InstructorRow[]>([]);
	const [enrollments, setEnrollments] = useState<EnrollRow[]>([]);
	const [saving, setSaving] = useState(false);

	const [sessDate, setSessDate] = useState("");
	const [sessStart, setSessStart] = useState("");
	const [sessEnd, setSessEnd] = useState("");
	const [sessLoc, setSessLoc] = useState("");

	const [roster, setRoster] = useState<RosterRow[]>([]);
	const [pickStudent, setPickStudent] = useState("");

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/admin/courses/${courseId}`, { credentials: "include" });
			const data = (await res.json()) as {
				course?: CourseRow;
				sessions?: SessionRow[];
				instructor_id?: string | null;
				enrollments?: EnrollRow[];
				error?: string;
			};
			if (!res.ok) {
				setError(data.error ?? t("loadError"));
				return;
			}
			if (data.course) {
				setCourse(data.course);
				setTitle(data.course.title);
				setDescription(data.course.description ?? "");
				setMode(data.course.mode as "online" | "offline");
				setCapacity(data.course.capacity);
			}
			setSessions(data.sessions ?? []);
			setInstructorId(data.instructor_id ?? "");
			setEnrollments(data.enrollments ?? []);

			const [insRes, rosterRes] = await Promise.all([
				fetch("/api/admin/instructors", { credentials: "include" }),
				fetch("/api/admin/roster", { credentials: "include" }),
			]);
			const insJson = (await insRes.json()) as { instructors?: InstructorRow[] };
			const rosterJson = (await rosterRes.json()) as { students?: RosterRow[] };
			if (insRes.ok) setAllInstructors(insJson.instructors ?? []);
			if (rosterRes.ok) setRoster(rosterJson.students ?? []);
		} catch {
			setError(t("loadError"));
		} finally {
			setLoading(false);
		}
	}, [courseId, t]);

	useEffect(() => {
		void load();
	}, [load]);

	async function saveCourse() {
		setSaving(true);
		setError(null);
		try {
			const res = await fetch(`/api/admin/courses/${courseId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					title: title.trim(),
					description: description.trim() || null,
					mode,
					capacity,
					instructor_id: instructorId ? instructorId : null,
				}),
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
			setSaving(false);
		}
	}

	async function addSession() {
		if (!sessDate || !sessStart || !sessEnd) return;
		setSaving(true);
		setError(null);
		try {
			const res = await fetch(`/api/admin/courses/${courseId}/sessions`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					session_date: sessDate,
					start_time: sessStart,
					end_time: sessEnd,
					location: sessLoc.trim() || null,
				}),
			});
			const data = (await res.json()) as { error?: string };
			if (!res.ok) {
				setError(data.error ?? t("saveError"));
				return;
			}
			setSessDate("");
			setSessStart("");
			setSessEnd("");
			setSessLoc("");
			void load();
		} catch {
			setError(t("saveError"));
		} finally {
			setSaving(false);
		}
	}

	async function deleteSession(id: string) {
		if (!confirm(t("confirmDelete"))) return;
		await fetch(`/api/admin/sessions/${id}`, { method: "DELETE", credentials: "include" });
		void load();
	}

	async function addEnrollment() {
		if (!pickStudent) return;
		setSaving(true);
		setError(null);
		try {
			const res = await fetch("/api/admin/enrollments", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ course_id: courseId, student_record_id: pickStudent }),
			});
			const data = (await res.json()) as { error?: string };
			if (!res.ok) {
				setError(data.error ?? t("saveError"));
				return;
			}
			setPickStudent("");
			void load();
		} catch {
			setError(t("saveError"));
		} finally {
			setSaving(false);
		}
	}

	async function removeEnrollment(id: string) {
		await fetch(`/api/admin/enrollments?id=${encodeURIComponent(id)}`, {
			method: "DELETE",
			credentials: "include",
		});
		void load();
	}

	function fmtTime(tstr: string) {
		return tstr?.length >= 5 ? tstr.slice(0, 5) : tstr;
	}

	if (loading && !course) {
		return <p className="text-muted-foreground text-sm">…</p>;
	}
	if (!course) {
		return <p className="text-destructive text-sm">{error ?? t("loadError")}</p>;
	}

	return (
		<div className="space-y-8">
			<p className="text-sm">
				<Link href="/admin/courses" className="text-cyan-300 underline-offset-4 hover:underline">
					← {t("coursesTitle")}
				</Link>
			</p>
			{error && <p className="text-destructive text-sm">{error}</p>}

			<Card className="border-border/60 bg-card/35">
				<CardHeader>
					<CardTitle className="text-base">{t("courseName")}</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-2 sm:col-span-2">
							<Label htmlFor="cd-title">{t("courseName")}</Label>
							<Input
								id="cd-title"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								className="h-10"
							/>
						</div>
						<div className="space-y-2 sm:col-span-2">
							<Label htmlFor="cd-desc">{t("courseDesc")}</Label>
							<Textarea
								id="cd-desc"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								className="min-h-[72px]"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="cd-mode">{t("courseMode")}</Label>
							<select
								id="cd-mode"
								value={mode}
								onChange={(e) => setMode(e.target.value as "online" | "offline")}
								className="border-input bg-background h-10 w-full rounded-lg border px-3 text-sm dark:bg-input/30"
							>
								<option value="online">{t("modeOnline")}</option>
								<option value="offline">{t("modeOffline")}</option>
							</select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="cd-cap">{t("capacity")}</Label>
							<Input
								id="cd-cap"
								type="number"
								min={1}
								value={capacity}
								onChange={(e) => setCapacity(parseInt(e.target.value, 10) || 1)}
								className="h-10"
							/>
						</div>
						<div className="space-y-2 sm:col-span-2">
							<Label htmlFor="cd-ins">{t("assignInstructors")}</Label>
							<select
								id="cd-ins"
								value={instructorId}
								onChange={(e) => setInstructorId(e.target.value)}
								className="border-input bg-background h-10 w-full rounded-lg border px-3 text-sm dark:bg-input/30"
							>
								<option value="">—</option>
								{allInstructors.map((ins) => (
									<option key={ins.id} value={ins.id}>
										{ins.name}
									</option>
								))}
							</select>
						</div>
					</div>
					<Button type="button" disabled={saving} onClick={() => void saveCourse()}>
						{t("save")}
					</Button>
				</CardContent>
			</Card>

			<Card className="border-border/60 bg-card/35">
				<CardHeader>
					<CardTitle className="text-base">{t("sessionsTitle")}</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
				<ul className="space-y-2 text-sm">
					{sessions.map((s) => (
						<li
							key={s.id}
							className="border-border/40 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
						>
							<span>
								{s.date} {fmtTime(s.start_time)}–{fmtTime(s.end_time)}
								{s.location ? ` · ${s.location}` : ""}
							</span>
							<Button type="button" variant="outline" size="sm" onClick={() => void deleteSession(s.id)}>
								{t("removeEnrollment")}
							</Button>
						</li>
					))}
				</ul>
				<div className="grid gap-2 sm:grid-cols-4">
					<input
						type="date"
						value={sessDate}
						onChange={(e) => setSessDate(e.target.value)}
						className="border-input bg-background h-10 rounded-md border px-2 text-sm"
					/>
					<input
						type="time"
						value={sessStart}
						onChange={(e) => setSessStart(e.target.value)}
						className="border-input bg-background h-10 rounded-md border px-2 text-sm"
					/>
					<input
						type="time"
						value={sessEnd}
						onChange={(e) => setSessEnd(e.target.value)}
						className="border-input bg-background h-10 rounded-md border px-2 text-sm"
					/>
					<input
						value={sessLoc}
						onChange={(e) => setSessLoc(e.target.value)}
						placeholder={t("location")}
						className="border-input bg-background h-10 rounded-md border px-2 text-sm sm:col-span-4"
					/>
				</div>
					<Button type="button" size="sm" disabled={saving} onClick={() => void addSession()}>
						{t("addSession")}
					</Button>
				</CardContent>
			</Card>

			<Card className="border-border/60 bg-card/35">
				<CardHeader>
					<CardTitle className="text-base">
						{t("enrollTitle")}（{enrollments.length}/{capacity}）
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
				<div className="flex flex-wrap gap-2">
					<select
						value={pickStudent}
						onChange={(e) => setPickStudent(e.target.value)}
						className="border-input bg-background h-10 min-w-[200px] rounded-md border px-2 text-sm"
					>
						<option value="">—</option>
						{roster.map((s) => (
							<option key={s.id} value={s.id}>
								{s.student_id} {s.nickname ?? s.email}
							</option>
						))}
					</select>
					<Button type="button" size="sm" disabled={saving || !pickStudent} onClick={() => void addEnrollment()}>
						{t("enrollAdd")}
					</Button>
				</div>
					<ul className="space-y-1 text-sm">
						{enrollments.map((e) => (
							<li key={e.id} className="flex items-center justify-between gap-2">
								<span>
									{e.student?.student_id} {e.student?.nickname ?? e.student?.email}
								</span>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => void removeEnrollment(e.id)}
								>
									{t("removeEnrollment")}
								</Button>
							</li>
						))}
					</ul>
				</CardContent>
			</Card>
		</div>
	);
}
