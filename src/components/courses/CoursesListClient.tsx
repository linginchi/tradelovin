"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth/use-auth";
import { cn } from "@/lib/utils";
import { HUB_TOPIC_SORT, hubTopicMessageKey, isLiveHubTopic } from "@/lib/courses/hub-topics";

type TopicRow = {
	id: string;
	title: string;
	description: string | null;
	sort_order: number;
	courseCount: number;
};

export type CourseRow = {
	id: string;
	title: string;
	description: string | null;
	mode: string | null;
	start_date: string | null;
	end_date: string | null;
	location: string | null;
	topic_id?: string | null;
};

type RegRow = {
	status: string;
	courses?: { id: string } | null;
};

export function CoursesListClient() {
	const t = useTranslations("CoursesPage");
	const searchParams = useSearchParams();
	const router = useRouter();
	const topicId = searchParams.get("topic");
	const { isAuthed, isLoading } = useAuth();
	const [topics, setTopics] = useState<TopicRow[] | null>(null);
	const [courses, setCourses] = useState<CourseRow[] | null>(null);
	const [err, setErr] = useState<string | null>(null);
	const [myStatus, setMyStatus] = useState<Record<string, string>>({});
	const selectedTopic = topics?.find((topic) => topic.id === topicId) ?? null;

	useEffect(() => {
		let alive = true;
		async function loadTopics() {
			try {
				const res = await fetch("/api/course-topics");
				const json = (await res.json()) as { topics?: TopicRow[]; error?: string };
				if (!alive) return;
				if (!res.ok) {
					setErr(json.error ?? t("hubLoadError"));
					setTopics([]);
					return;
				}
				setTopics(json.topics ?? []);
			} catch {
				if (alive) {
					setErr(t("hubLoadError"));
					setTopics([]);
				}
			}
		}
		void loadTopics();
		return () => {
			alive = false;
		};
	}, [t]);

	useEffect(() => {
		if (!selectedTopic || isLiveHubTopic(selectedTopic.sort_order)) {
			return;
		}
		const topic = selectedTopic;
		let alive = true;
		async function loadCourses() {
			setCourses(null);
			try {
				const res = await fetch(`/api/courses?topicId=${encodeURIComponent(topic.id)}`);
				const json = (await res.json()) as { courses?: CourseRow[]; error?: string };
				if (!alive) return;
				if (!res.ok) {
					setErr(json.error ?? "Error");
					setCourses([]);
					return;
				}
				setCourses(json.courses ?? []);
			} catch {
				if (alive) {
					setErr("Error");
					setCourses([]);
				}
			}
		}
		void loadCourses();
		return () => {
			alive = false;
		};
	}, [selectedTopic]);

	useEffect(() => {
		let alive = true;
		async function loadRegistrations() {
			if (!isAuthed || !selectedTopic || isLiveHubTopic(selectedTopic.sort_order) || courses === null) {
				setMyStatus({});
				return;
			}
			const res = await fetch("/api/courses/my-registrations", { credentials: "include" });
			const json = (await res.json()) as { registrations?: RegRow[] };
			if (!alive || !res.ok) return;
			const map: Record<string, string> = {};
			for (const registration of json.registrations ?? []) {
				const id = registration.courses?.id;
				if (id) map[id] = registration.status;
			}
			setMyStatus(map);
		}
		void loadRegistrations();
		return () => {
			alive = false;
		};
	}, [courses, isAuthed, selectedTopic]);

	if (topics === null && !err) {
		return <Loading />;
	}

	if (err) {
		return <p className="text-destructive text-center text-sm">{err}</p>;
	}

	if (!selectedTopic) {
		return (
			<ul className="mx-auto grid max-w-3xl gap-4">
				{[HUB_TOPIC_SORT.classic, HUB_TOPIC_SORT.recorded, HUB_TOPIC_SORT.live]
					.map((sortOrder) => topics?.find((topic) => topic.sort_order === sortOrder))
					.filter((topic): topic is TopicRow => Boolean(topic))
					.map((topic) => {
						const messageKey = hubTopicMessageKey(topic.sort_order);
						const blurbKey = messageKey ? `${messageKey}Blurb` as const : null;
						return (
							<li key={topic.id} className="border-border/80 bg-card/40 rounded-xl border p-5">
								<button
									type="button"
									className="w-full text-left"
									onClick={() => router.push(`/courses?topic=${topic.id}`)}
								>
									<h2 className="text-lg font-semibold">{messageKey ? t(messageKey) : topic.title}</h2>
									<p className="text-muted-foreground mt-2 text-sm">
										{blurbKey ? t(blurbKey) : topic.description}
									</p>
								</button>
							</li>
						);
					})}
			</ul>
		);
	}

	if (isLiveHubTopic(selectedTopic.sort_order)) {
		return (
			<div className="mx-auto max-w-3xl">
				<Link href="/courses" className="text-muted-foreground mb-6 inline-block text-sm hover:underline">
					{t("backToHub")}
				</Link>
				<p className="text-muted-foreground text-center text-sm">{t("hubLiveEmpty")}</p>
			</div>
		);
	}

	if (courses === null) return <Loading />;

	return (
		<div>
			<Link href="/courses" className="text-muted-foreground mx-auto mb-6 block max-w-3xl text-sm hover:underline">
				{t("backToHub")}
			</Link>
			{!courses.length ? (
				<p className="text-muted-foreground text-center text-sm">{t("empty")}</p>
			) : (
				<CourseList courses={courses} myStatus={myStatus} isAuthed={isAuthed} isLoading={isLoading} t={t} />
			)}
		</div>
	);
}

function Loading() {
	return (
		<div className="flex justify-center py-16">
			<Loader2 className="size-8 animate-spin text-cyan-400/70" />
		</div>
	);
}

function CourseList({
	courses,
	myStatus,
	isAuthed,
	isLoading,
	t,
}: {
	courses: CourseRow[];
	myStatus: Record<string, string>;
	isAuthed: boolean;
	isLoading: boolean;
	t: (key: string) => string;
}) {
	return (
		<ul className="mx-auto grid max-w-3xl gap-4">
			{courses.map((course) => {
				const status = myStatus[course.id];
				return (
					<li key={course.id} className="border-border/80 bg-card/40 flex flex-col gap-3 rounded-xl border p-5 backdrop-blur-sm">
						<div>
							<h2 className="text-lg font-semibold">{course.title}</h2>
							<p className="text-muted-foreground mt-1 text-xs">
								{course.mode === "online" ? t("modeOnline") : course.mode === "offline" ? t("modeOffline") : "—"}
								{course.start_date ? ` · ${course.start_date}` : ""}
							</p>
							{course.description ? <p className="text-muted-foreground mt-2 line-clamp-3 text-sm">{course.description}</p> : null}
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<Link href={`/courses/${course.id}`}>
								<Button type="button" variant="outline" size="sm">{t("view")}</Button>
							</Link>
							{status ? (
								<span className={cn(
									"rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
									status === "approved" && "bg-emerald-500/20 text-emerald-200",
									status === "rejected" && "bg-destructive/20 text-red-200",
									status === "pending" && "bg-amber-500/15 text-amber-100",
								)}>
									{status === "pending" ? t("pending") : status === "approved" ? t("approved") : t("rejected")}
								</span>
							) : !isLoading && !isAuthed ? (
								<span className="text-muted-foreground text-xs">{t("needLogin")}</span>
							) : null}
						</div>
					</li>
				);
			})}
		</ul>
	);
}
