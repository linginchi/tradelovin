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
import { Link } from "@/i18n/navigation";

export type CourseListRow = {
	id: string;
	title: string;
	description: string | null;
	mode: "online" | "offline";
	capacity: number;
	enrollment_count: number;
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

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/admin/courses", { credentials: "include" });
			const data = (await res.json()) as { courses?: CourseListRow[]; error?: string };
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
		void load();
	}, [load]);

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
			void load();
		} catch {
			setError(t("saveError"));
		} finally {
			setCreating(false);
		}
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
					</div>
					<Button type="button" disabled={creating || !name.trim()} onClick={() => void createCourse()}>
						{t("newCourse")}
					</Button>
				</CardContent>
			</Card>

			{error && <p className="text-destructive text-sm">{error}</p>}

			<div className="rounded-xl border border-border/60 bg-card/25 ring-1 ring-foreground/5">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t("courseName")}</TableHead>
							<TableHead>{t("courseMode")}</TableHead>
							<TableHead>{t("capacity")}</TableHead>
							<TableHead>{t("enrollmentCount")}</TableHead>
							<TableHead className="text-right">{t("actions")}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{loading ? (
							<TableRow>
								<TableCell colSpan={5} className="text-muted-foreground py-10 text-center">
									…
								</TableCell>
							</TableRow>
						) : courses.length === 0 ? (
							<TableRow>
								<TableCell colSpan={5} className="text-muted-foreground py-10 text-center">
									{t("empty")}
								</TableCell>
							</TableRow>
						) : (
							courses.map((c) => (
								<TableRow key={c.id}>
									<TableCell className="font-medium">{c.title}</TableCell>
									<TableCell>{c.mode === "online" ? t("modeOnline") : t("modeOffline")}</TableCell>
									<TableCell className="tabular-nums">{c.capacity}</TableCell>
									<TableCell className="tabular-nums">{c.enrollment_count}</TableCell>
									<TableCell className="text-right">
										<Link
											href={`/admin/courses/${c.id}`}
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
