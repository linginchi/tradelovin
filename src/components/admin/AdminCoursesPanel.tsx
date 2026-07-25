"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import Link from "next/link";

export type CourseListRow = {
	id: string;
	title: string;
	description: string | null;
	mode: "online" | "offline";
	capacity: number;
	enrollment_count: number;
	instructor_name?: string | null;
	topic_id?: string | null;
};

export type CourseTopicRow = {
	id: string;
	title: string;
	description: string | null;
	sort_order: number;
	is_active: boolean;
};

export function AdminCoursesPanel() {
	const t = useTranslations("Admin");
	const [courses, setCourses] = useState<CourseListRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [mode, setMode] = useState<"online" | "offline">("online");
	const [capacity, setCapacity] = useState(30);
	const [creating, setCreating] = useState(false);
	const [topics, setTopics] = useState<CourseTopicRow[]>([]);
	const [topicsUnavailable, setTopicsUnavailable] = useState(false);
	const [topicError, setTopicError] = useState<string | null>(null);
	const [topicBusy, setTopicBusy] = useState(false);
	const [newTopicName, setNewTopicName] = useState("");
	const [newTopicDesc, setNewTopicDesc] = useState("");
	const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
	const [editTopicName, setEditTopicName] = useState("");
	const [editTopicDesc, setEditTopicDesc] = useState("");
	const [courseTopicId, setCourseTopicId] = useState("");

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const [res, topicRes] = await Promise.all([
				fetch("/api/admin/courses", { credentials: "include" }),
				fetch("/api/admin/course-topics", { credentials: "include" }),
			]);
			const data = (await res.json()) as { courses?: CourseListRow[]; error?: string };
			const topicData = (await topicRes.json()) as { topics?: CourseTopicRow[]; error?: string };

			setTopicsUnavailable(!topicRes.ok);
			setTopics(topicRes.ok ? (topicData.topics ?? []) : []);
			setTopicError(topicRes.ok ? null : (topicData.error ?? t("courseTopicUnavailable")));

			if (!res.ok) {
				setError(data.error ?? t("loadError"));
				return;
			}
			setCourses(data.courses ?? []);
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

	async function createCourse() {
		if (!name.trim()) return;
		setCreating(true);
		setError(null);
		try {
			const payload: Record<string, unknown> = {
				title: name.trim(),
				description: description.trim() || null,
				mode,
				capacity,
			};
			if (courseTopicId) payload.topic_id = courseTopicId;

			const res = await fetch("/api/admin/courses", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify(payload),
			});
			const data = (await res.json()) as { error?: string };
			if (!res.ok) {
				setError(data.error ?? t("saveError"));
				return;
			}
			setName("");
			setDescription("");
			setCapacity(30);
			setCourseTopicId("");
			void load();
		} catch {
			setError(t("saveError"));
		} finally {
			setCreating(false);
		}
	}

	async function callTopicApi(path: string, init: RequestInit) {
		const res = await fetch(path, { credentials: "include", ...init });
		let payload: { error?: string } = {};
		try {
			payload = (await res.json()) as { error?: string };
		} catch {
			payload = {};
		}
		if (!res.ok) throw new Error(payload.error ?? t("saveError"));
	}

	async function createTopic() {
		const title = newTopicName.trim();
		if (!title) return;
		setTopicBusy(true);
		setTopicError(null);
		try {
			await callTopicApi("/api/admin/course-topics", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					title,
					description: newTopicDesc.trim() || null,
					sort_order: topics.length,
					is_active: true,
				}),
			});
			setNewTopicName("");
			setNewTopicDesc("");
			await load();
		} catch (err) {
			setTopicError(err instanceof Error ? err.message : t("saveError"));
		} finally {
			setTopicBusy(false);
		}
	}

	async function patchTopic(id: string, patch: Record<string, unknown>) {
		setTopicBusy(true);
		setTopicError(null);
		try {
			await callTopicApi(`/api/admin/course-topics/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(patch),
			});
			await load();
			return true;
		} catch (err) {
			setTopicError(err instanceof Error ? err.message : t("saveError"));
			return false;
		} finally {
			setTopicBusy(false);
		}
	}

	async function saveTopicEdit() {
		if (!editingTopicId || !editTopicName.trim()) return;
		const ok = await patchTopic(editingTopicId, {
			title: editTopicName.trim(),
			description: editTopicDesc.trim() || null,
		});
		if (ok) setEditingTopicId(null);
	}

	async function deleteTopic(id: string) {
		if (!confirm(t("confirmDelete"))) return;
		setTopicBusy(true);
		setTopicError(null);
		try {
			await callTopicApi(`/api/admin/course-topics/${id}`, { method: "DELETE" });
			if (editingTopicId === id) setEditingTopicId(null);
			await load();
		} catch (err) {
			setTopicError(err instanceof Error ? err.message : t("saveError"));
		} finally {
			setTopicBusy(false);
		}
	}

	// Rewrites sort_order into a dense sequence so ordering stays stable even when
	// several topics still share the default value.
	async function reorderTopic(index: number, direction: -1 | 1) {
		const target = index + direction;
		if (target < 0 || target >= topics.length) return;
		const next = [...topics];
		[next[index], next[target]] = [next[target], next[index]];

		setTopicBusy(true);
		setTopicError(null);
		try {
			for (let i = 0; i < next.length; i += 1) {
				if (next[i].sort_order === i) continue;
				await callTopicApi(`/api/admin/course-topics/${next[i].id}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ sort_order: i }),
				});
			}
			await load();
		} catch (err) {
			setTopicError(err instanceof Error ? err.message : t("saveError"));
		} finally {
			setTopicBusy(false);
		}
	}

	function startEditTopic(topic: CourseTopicRow) {
		setEditingTopicId(topic.id);
		setEditTopicName(topic.title);
		setEditTopicDesc(topic.description ?? "");
	}

	const activeTopics = topics.filter((topic) => topic.is_active);
	const topicById = new Map(topics.map((topic) => [topic.id, topic]));

	function topicLabel(id?: string | null) {
		if (!id) return "—";
		const topic = topicById.get(id);
		if (!topic) return t("courseTopicMissing");
		return topic.is_active ? topic.title : `${topic.title}（${t("courseTopicInactive")}）`;
	}

	return (
		<div className="space-y-6">
			<Card className="border-border/60 bg-card/35">
				<CardHeader>
					<CardTitle className="text-base">{t("newCourse")}</CardTitle>
					<CardDescription>{t("coursesFormDesc")}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2 sm:col-span-2">
							<Label htmlFor="course-title">{t("courseName")}</Label>
							<Input
								id="course-title"
								value={name}
								onChange={(e) => setName(e.target.value)}
								className="h-10"
							/>
						</div>
						<div className="space-y-2 sm:col-span-2">
							<Label htmlFor="course-desc">{t("courseDesc")}</Label>
							<Textarea
								id="course-desc"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								className="min-h-[64px]"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="course-mode">{t("courseMode")}</Label>
							<select
								id="course-mode"
								value={mode}
								onChange={(e) => setMode(e.target.value as "online" | "offline")}
								className="border-input bg-background h-10 w-full rounded-lg border px-3 text-sm dark:bg-input/30"
							>
								<option value="online">{t("modeOnline")}</option>
								<option value="offline">{t("modeOffline")}</option>
							</select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="course-cap">{t("capacity")}</Label>
							<Input
								id="course-cap"
								type="number"
								min={1}
								value={capacity}
								onChange={(e) => setCapacity(parseInt(e.target.value, 10) || 1)}
								className="h-10"
							/>
						</div>
						<div className="space-y-2 sm:col-span-2">
							<Label htmlFor="course-topic">{t("courseTopicField")}</Label>
							<select
								id="course-topic"
								value={courseTopicId}
								disabled={topicsUnavailable}
								onChange={(e) => setCourseTopicId(e.target.value)}
								className="border-input bg-background h-10 w-full rounded-lg border px-3 text-sm disabled:opacity-60 dark:bg-input/30"
							>
								<option value="">{t("courseTopicNone")}</option>
								{activeTopics.map((topic) => (
									<option key={topic.id} value={topic.id}>
										{topic.title}
									</option>
								))}
							</select>
						</div>
					</div>
					<Button type="button" disabled={creating || !name.trim()} onClick={() => void createCourse()}>
						{t("newCourse")}
					</Button>
				</CardContent>
			</Card>

			<Card className="border-border/60 bg-card/35">
				<CardHeader>
					<CardTitle className="text-base">{t("courseTopicsTitle")}</CardTitle>
					<CardDescription>{t("courseTopicsSubtitle")}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{topicsUnavailable ? (
						<p className="text-sm text-amber-300">{t("courseTopicUnavailable")}</p>
					) : null}
					{topicError && !topicsUnavailable ? (
						<p className="text-destructive text-sm">{topicError}</p>
					) : null}

					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="topic-name">{t("courseTopicName")}</Label>
							<Input
								id="topic-name"
								value={newTopicName}
								onChange={(e) => setNewTopicName(e.target.value)}
								className="h-10"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="topic-desc">{t("courseTopicDescription")}</Label>
							<Input
								id="topic-desc"
								value={newTopicDesc}
								onChange={(e) => setNewTopicDesc(e.target.value)}
								className="h-10"
							/>
						</div>
					</div>
					<Button
						type="button"
						size="sm"
						disabled={topicBusy || topicsUnavailable || !newTopicName.trim()}
						onClick={() => void createTopic()}
					>
						{t("courseTopicAdd")}
					</Button>

					<ul className="space-y-2 text-sm">
						{topics.map((topic, index) => (
							<li key={topic.id} className="border-border/40 rounded-lg border px-3 py-2">
								{editingTopicId === topic.id ? (
									<div className="space-y-2">
										<Input
											value={editTopicName}
											onChange={(e) => setEditTopicName(e.target.value)}
											className="h-9"
											aria-label={t("courseTopicName")}
										/>
										<Input
											value={editTopicDesc}
											onChange={(e) => setEditTopicDesc(e.target.value)}
											className="h-9"
											aria-label={t("courseTopicDescription")}
										/>
										<div className="flex flex-wrap gap-2">
											<Button
												type="button"
												size="sm"
												disabled={topicBusy || !editTopicName.trim()}
												onClick={() => void saveTopicEdit()}
											>
												{t("save")}
											</Button>
											<Button
												type="button"
												variant="outline"
												size="sm"
												onClick={() => setEditingTopicId(null)}
											>
												{t("cancel")}
											</Button>
										</div>
									</div>
								) : (
									<div className="flex flex-wrap items-center justify-between gap-2">
										<div>
											<div className="font-medium">{topic.title}</div>
											<div className="text-muted-foreground text-xs">
												#{topic.sort_order} ·{" "}
												{topic.is_active ? t("courseTopicActive") : t("courseTopicInactive")}
												{topic.description ? ` · ${topic.description}` : ""}
											</div>
										</div>
										<div className="flex flex-wrap gap-2">
											<Button
												type="button"
												variant="outline"
												size="sm"
												disabled={topicBusy || index === 0}
												onClick={() => void reorderTopic(index, -1)}
											>
												{t("courseTopicMoveUp")}
											</Button>
											<Button
												type="button"
												variant="outline"
												size="sm"
												disabled={topicBusy || index === topics.length - 1}
												onClick={() => void reorderTopic(index, 1)}
											>
												{t("courseTopicMoveDown")}
											</Button>
											<Button
												type="button"
												variant="outline"
												size="sm"
												disabled={topicBusy}
												onClick={() => startEditTopic(topic)}
											>
												{t("edit")}
											</Button>
											<Button
												type="button"
												variant="outline"
												size="sm"
												disabled={topicBusy}
												onClick={() => void patchTopic(topic.id, { is_active: !topic.is_active })}
											>
												{topic.is_active ? t("courseTopicDisable") : t("courseTopicEnable")}
											</Button>
											<Button
												type="button"
												variant="outline"
												size="sm"
												disabled={topicBusy}
												onClick={() => void deleteTopic(topic.id)}
											>
												{t("remove")}
											</Button>
										</div>
									</div>
								)}
							</li>
						))}
						{topics.length === 0 && !topicsUnavailable ? (
							<li className="text-muted-foreground">{t("courseTopicEmpty")}</li>
						) : null}
					</ul>
				</CardContent>
			</Card>

			{error && <p className="text-destructive text-sm">{error}</p>}

			<div className="rounded-xl border border-border/60 bg-card/25 ring-1 ring-foreground/5">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t("courseName")}</TableHead>
							<TableHead className="hidden md:table-cell">{t("courseTopicColumn")}</TableHead>
							<TableHead>{t("courseMode")}</TableHead>
							<TableHead>{t("capacity")}</TableHead>
							<TableHead>{t("enrollmentCount")}</TableHead>
							<TableHead className="hidden md:table-cell">{t("colInstructor")}</TableHead>
							<TableHead className="text-right">{t("actions")}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{loading ? (
							<TableRow>
								<TableCell colSpan={7} className="text-muted-foreground py-10 text-center">
									??
								</TableCell>
							</TableRow>
						) : courses.length === 0 ? (
							<TableRow>
								<TableCell colSpan={7} className="text-muted-foreground py-10 text-center">
									{t("empty")}
								</TableCell>
							</TableRow>
						) : (
							courses.map((c) => (
								<TableRow key={c.id}>
									<TableCell className="font-medium">{c.title}</TableCell>
									<TableCell className="text-muted-foreground hidden text-sm md:table-cell">
										{topicLabel(c.topic_id)}
									</TableCell>
									<TableCell>{c.mode === "online" ? t("modeOnline") : t("modeOffline")}</TableCell>
									<TableCell className="tabular-nums">{c.capacity}</TableCell>
									<TableCell className="tabular-nums">{c.enrollment_count}</TableCell>
									<TableCell className="text-muted-foreground hidden text-sm md:table-cell">
										{c.instructor_name ?? "�"}
									</TableCell>
									<TableCell className="text-right">
										<Link
											href={`/cjkzt/courses/${c.id}`}
											className="text-cyan-300 text-xs font-medium underline-offset-4 hover:underline"
										>
											{t("goDetail")}
										</Link>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
