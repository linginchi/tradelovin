"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth/use-auth";
import type { CourseRow } from "@/components/courses/CoursesListClient";

type Props = { courseId: string };

export function CourseDetailClient({ courseId }: Props) {
	const t = useTranslations("CourseDetailPage");
	const tc = useTranslations("CoursesPage");
	const [course, setCourse] = useState<CourseRow | null | undefined>(undefined);
	const [applied, setApplied] = useState(false);
	const [busy, setBusy] = useState(false);
	const { isAuthed } = useAuth();

	useEffect(() => {
		let alive = true;
		async function run() {
			const res = await fetch(`/api/courses/${courseId}`);
			const js = (await res.json()) as { course?: CourseRow; error?: string };
			if (!alive) return;
			if (!res.ok) {
				setCourse(null);
				return;
			}
			setCourse(js.course ?? null);
		}
		void run();
		return () => {
			alive = false;
		};
	}, [courseId]);

	useEffect(() => {
		let alive = true;
		async function run() {
			if (!isAuthed) return;
			const mr = await fetch("/api/courses/my-registrations", { credentials: "include" });
			const mjs = (await mr.json()) as {
				registrations?: { courses?: { id: string } | null }[];
			};
			if (!alive) return;
			if (mr.ok && mjs.registrations?.some((r) => r.courses?.id === courseId)) {
				setApplied(true);
			}
		}
		void run();
		return () => {
			alive = false;
		};
	}, [courseId, isAuthed]);

	async function apply() {
		setBusy(true);
		const res = await fetch("/api/courses/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({ courseId }),
		});
		const js = (await res.json()) as { success?: boolean; error?: string };
		setBusy(false);
		if (!res.ok || !js.success) {
			toast.error(js.error ?? "Error");
			return;
		}
		toast.success(tc("applied"));
		setApplied(true);
	}

	if (course === undefined) {
		return (
			<div className="flex justify-center py-16">
				<Loader2 className="size-8 animate-spin text-cyan-400/70" />
			</div>
		);
	}

	if (!course) {
		return <p className="text-destructive text-center text-sm">{t("loadError")}</p>;
	}

	return (
		<div className="border-border/80 bg-card/40 mx-auto w-full max-w-2xl space-y-6 rounded-xl border p-6 backdrop-blur-sm md:p-8">
			<Link href="/courses" className="text-muted-foreground text-sm hover:text-foreground">
				{tc("back")}
			</Link>
			<div>
				<h1 className="text-2xl font-semibold">{course.title}</h1>
				<p className="text-muted-foreground mt-2 text-sm">
					{course.mode === "online" ? tc("modeOnline") : course.mode === "offline" ? tc("modeOffline") : "—"}
					{course.start_date ? ` · ${course.start_date}` : ""}
					{course.location ? ` · ${course.location}` : ""}
				</p>
				{course.description ? (
					<p className="text-muted-foreground mt-4 text-sm leading-relaxed">{course.description}</p>
				) : null}
			</div>
			<div>
				{applied ? (
					<p className="text-cyan-200/90 text-sm">{t("applied")}</p>
				) : isAuthed ? (
					<Button type="button" onClick={() => void apply()} disabled={busy}>
						{busy ? <Loader2 className="size-4 animate-spin" /> : t("apply")}
					</Button>
				) : (
					<p className="text-muted-foreground text-sm">{t("loginToApply")}</p>
				)}
			</div>
		</div>
	);
}
