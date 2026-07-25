"use client";

import { Loader2, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
	topic_title?: string | null;
	topic_sort_order?: number | null;
};

type TopicRow = {
	id: string;
	title: string;
	description: string | null;
	sort_order: number;
	is_active: boolean;
	content_kind: string | null;
};

const UNASSIGNED_KEY = "__unassigned__";

export function AdminCoursesPanel() {
	const t = useTranslations("Admin");
	const [courses, setCourses] = useState<CourseListRow[]>([]);
	const [topics, setTopics] = useState<TopicRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [mode, setMode] = useState<"online" | "offline">("online");
	const [capacity, setCapacity] = useState(30);
	const [topicId, setTopicId] = useState<string>("");
	const [creating, setCreating] = useState(false);

	const [topicTitle, setTopicTitle] = useState("");
	const [topicDesc, setTopicDesc] = useState("");
	const [topicSort, setTopicSort] = useState(0);
	const [topicContentKind, setTopicContentKind] = useState<"ai_classic" | "kol">("ai_classic");
	const [topicSaving, setTopicSaving] = useState(false);
	const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
	const [editTopicTitle, setEditTopicTitle] = useState("");
	const [editTopicDesc, setEditTopicDesc] = useState("");
	const [editTopicSort, setEditTopicSort] = useState(0);

	const loadTopics = useCallback(async () => {
		const res = await fetch("/api/admin/course-topics", { credentials: "include" });
		const data = (await res.json()) as { topics?: TopicRow[]; error?: string };
		if (res.ok) {
			setTopics(data.topics ?? []);
		}
		return data;
	}, []);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const [courseRes] = await Promise.all([
				fetch("/api/admin/courses", { credentials: "include" }),
				loadTopics(),
			]);
			const data = (await courseRes.json()) as { courses?: CourseListRow[]; error?: string };
			if (!courseRes.ok) {
				setError(data.error ?? t("loadError"));
				return;
			}
			setCourses(data.courses ?? []);
		} catch {
			setError(t("loadError"));
		} finally {
			setLoading(false);
		}
	}, [loadTopics, t]);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			void load();
		}, 0);
		return () => window.clearTimeout(timer);
	}, [load]);

	const groupedCourses = useMemo(() => {
		const groups = new Map<string, CourseListRow[]>();
		for (const c of courses) {
			const key = c.topic_id ?? UNASSIGNED_KEY;
			const list = groups.get(key) ?? [];
			list.push(c);
			groups.set(key, list);
		}

		const topicOrder = new Map(topics.map((tp) => [tp.id, tp.sort_order]));
		const keys = [...groups.keys()].sort((a, b) => {
			if (a === UNASSIGNED_KEY) return 1;
			if (b === UNASSIGNED_KEY) return -1;
			return (topicOrder.get(a) ?? 0) - (topicOrder.get(b) ?? 0);
		});

		return keys.map((key) => {
			const topic =
				key === UNASSIGNED_KEY
					? null
					: topics.find((tp) => tp.id === key) ??
						{
							id: key,
							title: courses.find((c) => c.topic_id === key)?.topic_title ?? t("colTopic"),
							description: null,
							sort_order: courses.find((c) => c.topic_id === key)?.topic_sort_order ?? 0,
							is_active: true,
						};
			return {
				key,
				topic,
				courses: groups.get(key) ?? [],
			};
		});
	}, [courses, topics, t]);

	async function createCourse() {
		if (!name.trim()) return;
		setCreating(true);
		setError(null);
		try {
			const res = await fetch("/api/admin/courses", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					title: name.trim(),
					description: description.trim() || null,
					mode,
					capacity,
					topic_id: topicId || null,
				}),
			});
			const data = (await res.json()) as { error?: string };
			if (!res.ok) {
				setError(data.error ?? t("saveError"));
				return;
			}
			setName("");
			setDescription("");
			setCapacity(30);
			setTopicId("");
			void load();
		} catch {
			setError(t("saveError"));
		} finally {
			setCreating(false);
		}
	}

	async function createTopic() {
		if (!topicTitle.trim()) return;
		setTopicSaving(true);
		setError(null);
		try {
			const res = await fetch("/api/admin/course-topics", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					title: topicTitle.trim(),
					description: topicDesc.trim() || null,
					sort_order: topicSort,
					content_kind: topicContentKind,
				}),
			});
			const data = (await res.json()) as { error?: string };
			if (!res.ok) {
				setError(data.error ?? t("saveError"));
				return;
			}
			setTopicTitle("");
			setTopicDesc("");
			setTopicSort(0);
			setTopicContentKind("ai_classic");
			void load();
		} catch {
			setError(t("saveError"));
		} finally {
			setTopicSaving(false);
		}
	}

	async function saveTopicEdit(id: string) {
		if (!editTopicTitle.trim()) return;
		setTopicSaving(true);
		setError(null);
		try {
			const res = await fetch(`/api/admin/course-topics/${id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					title: editTopicTitle.trim(),
					description: editTopicDesc.trim() || null,
					sort_order: editTopicSort,
				}),
			});
			const data = (await res.json()) as { error?: string };
			if (!res.ok) {
				setError(data.error ?? t("saveError"));
				return;
			}
			setEditingTopicId(null);
			void load();
		} catch {
			setError(t("saveError"));
		} finally {
			setTopicSaving(false);
		}
	}

	async function deleteTopic(id: string) {
		if (!window.confirm(t("topicDeleteConfirm"))) return;
		setError(null);
		try {
			const res = await fetch(`/api/admin/course-topics/${id}`, {
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
		}
	}

	async function assignCourseTopic(courseId: string, newTopicId: string) {
		setError(null);
		try {
			const res = await fetch(`/api/admin/courses/${courseId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ topic_id: newTopicId || null }),
			});
			const data = (await res.json()) as { error?: string };
			if (!res.ok) {
				setError(data.error ?? t("saveError"));
				return;
			}
			void load();
		} catch {
			setError(t("saveError"));
		}
	}

	function startEditTopic(tp: TopicRow) {
		setEditingTopicId(tp.id);
		setEditTopicTitle(tp.title);
		setEditTopicDesc(tp.description ?? "");
		setEditTopicSort(tp.sort_order);
	}

	return (
		<div className="space-y-6">
			<Card className="border-border/60 bg-card/35">
				<CardHeader>
					<CardTitle className="text-base">{t("topicManagement")}</CardTitle>
					<CardDescription>{t("topicManagementDesc")}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-3">
						<div className="space-y-2 sm:col-span-2">
							<Label htmlFor="topic-title">{t("topicTitle")}</Label>
							<Input
								id="topic-title"
								value={topicTitle}
								onChange={(e) => setTopicTitle(e.target.value)}
								className="h-10"
								placeholder={t("topicTitlePlaceholder")}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="topic-sort">{t("topicSortOrder")}</Label>
							<Input
								id="topic-sort"
								type="number"
								min={0}
								value={topicSort}
								onChange={(e) => setTopicSort(parseInt(e.target.value, 10) || 0)}
								className="h-10"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="topic-kind">内容类型</Label>
							<select
								id="topic-kind"
								value={topicContentKind}
								onChange={(e) => setTopicContentKind(e.target.value as "ai_classic" | "kol")}
								className="border-input bg-background h-10 w-full rounded-lg border px-3 text-sm dark:bg-input/30"
							>
								<option value="ai_classic">AI+经典（订阅制）</option>
								<option value="kol">KOL（按片付费）</option>
							</select>
						</div>
						<div className="space-y-2 sm:col-span-3">
							<Label htmlFor="topic-desc">{t("topicDesc")}</Label>
							<Textarea
								id="topic-desc"
								value={topicDesc}
								onChange={(e) => setTopicDesc(e.target.value)}
								className="min-h-[56px]"
							/>
						</div>
					</div>
					<Button
						type="button"
						variant="secondary"
						disabled={topicSaving || !topicTitle.trim()}
						onClick={() => void createTopic()}
					>
						{t("topicAdd")}
					</Button>

					{topics.length > 0 ? (
						<ul className="divide-border/60 divide-y rounded-lg border border-border/60">
							{topics.map((tp) => (
								<li key={tp.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
									{editingTopicId === tp.id ? (
										<div className="grid flex-1 gap-2 sm:grid-cols-3">
											<Input
												value={editTopicTitle}
												onChange={(e) => setEditTopicTitle(e.target.value)}
												className="h-9"
											/>
											<Input
												type="number"
												min={0}
												value={editTopicSort}
												onChange={(e) => setEditTopicSort(parseInt(e.target.value, 10) || 0)}
												className="h-9"
											/>
											<Input
												value={editTopicDesc}
												onChange={(e) => setEditTopicDesc(e.target.value)}
												className="h-9"
												placeholder={t("topicDesc")}
											/>
										</div>
									) : (
										<div>
											<p className="font-medium">{tp.title}</p>
											<p className="text-muted-foreground text-xs">
												{t("topicSortOrder")}: {tp.sort_order}
												{tp.content_kind ? ` · ${tp.content_kind === "ai_classic" ? "AI+经典" : "KOL"}` : ""}
												{tp.description ? ` · ${tp.description}` : ""}
											</p>
										</div>
									)}
									<div className="flex shrink-0 gap-2">
										{editingTopicId === tp.id ? (
											<>
												<Button
													type="button"
													size="sm"
													disabled={topicSaving}
													onClick={() => void saveTopicEdit(tp.id)}
												>
													{t("save")}
												</Button>
												<Button
													type="button"
													size="sm"
													variant="ghost"
													onClick={() => setEditingTopicId(null)}
												>
													{t("cancel")}
												</Button>
											</>
										) : (
											<>
												<Button
													type="button"
													size="sm"
													variant="ghost"
													onClick={() => startEditTopic(tp)}
												>
													<Pencil className="size-4" />
												</Button>
												<Button
													type="button"
													size="sm"
													variant="ghost"
													className="text-destructive"
													onClick={() => void deleteTopic(tp.id)}
												>
													<Trash2 className="size-4" />
												</Button>
											</>
										)}
									</div>
								</li>
							))}
						</ul>
					) : (
						<p className="text-muted-foreground text-sm">{t("topicEmpty")}</p>
					)}
				</CardContent>
			</Card>

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
							<Label htmlFor="course-topic">{t("assignTopic")}</Label>
							<select
								id="course-topic"
								value={topicId}
								onChange={(e) => setTopicId(e.target.value)}
								className="border-input bg-background h-10 w-full rounded-lg border px-3 text-sm dark:bg-input/30"
							>
								<option value="">{t("topicUnassigned")}</option>
								{topics.map((tp) => (
									<option key={tp.id} value={tp.id}>
										{tp.title}
									</option>
								))}
							</select>
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
					</div>
					<Button type="button" disabled={creating || !name.trim()} onClick={() => void createCourse()}>
						{t("newCourse")}
					</Button>
				</CardContent>
			</Card>

			{error && <p className="text-destructive text-sm">{error}</p>}

			{loading ? (
				<div className="flex justify-center py-12">
					<Loader2 className="size-8 animate-spin text-cyan-400/70" />
				</div>
			) : (
				<div className="space-y-6">
					{groupedCourses.map((group) => (
						<div key={group.key} className="space-y-2">
							<h3 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
								{group.topic?.title ?? t("topicUnassigned")}
							</h3>
							<div className="rounded-xl border border-border/60 bg-card/25 ring-1 ring-foreground/5">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>{t("courseName")}</TableHead>
											<TableHead>{t("colTopic")}</TableHead>
											<TableHead>{t("courseMode")}</TableHead>
											<TableHead>{t("capacity")}</TableHead>
											<TableHead>{t("enrollmentCount")}</TableHead>
											<TableHead className="hidden md:table-cell">{t("colInstructor")}</TableHead>
											<TableHead className="text-right">{t("actions")}</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{group.courses.length === 0 ? (
											<TableRow>
												<TableCell colSpan={7} className="text-muted-foreground py-8 text-center text-sm">
													{t("empty")}
												</TableCell>
											</TableRow>
										) : (
											group.courses.map((c) => (
												<TableRow key={c.id}>
													<TableCell className="font-medium">{c.title}</TableCell>
													<TableCell>
														<select
															value={c.topic_id ?? ""}
															onChange={(e) => void assignCourseTopic(c.id, e.target.value)}
															className="border-input bg-background h-8 max-w-[140px] rounded-md border px-2 text-xs dark:bg-input/30"
														>
															<option value="">{t("topicUnassigned")}</option>
															{topics.map((tp) => (
																<option key={tp.id} value={tp.id}>
																	{tp.title}
																</option>
															))}
														</select>
													</TableCell>
													<TableCell>{c.mode === "online" ? t("modeOnline") : t("modeOffline")}</TableCell>
													<TableCell className="tabular-nums">{c.capacity}</TableCell>
													<TableCell className="tabular-nums">{c.enrollment_count}</TableCell>
													<TableCell className="text-muted-foreground hidden text-sm md:table-cell">
														{c.instructor_name ?? "—"}
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
					))}
				</div>
			)}
		</div>
	);
}
