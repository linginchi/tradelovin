"use client";

import { Loader2, PlayCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { extractLessonOrder } from "@/lib/analytics/lesson-order";
import { formatViewCount } from "@/lib/analytics/format";

export type VideoListItem = {
	id: string;
	course_id: string;
	course_title: string;
	title: string;
	description: string | null;
	duration: number | null;
	sort_order: number;
	is_free_preview: boolean;
	view_count: number;
	topic_id: string | null;
	topic_title: string | null;
	topic_sort_order: number;
	content_kind: string | null;
};

function formatDuration(sec: number | null): string {
	if (!sec || sec <= 0) return "";
	const m = Math.floor(sec / 60);
	const s = Math.floor(sec % 60);
	return `${m}:${s.toString().padStart(2, "0")}`;
}

const UNASSIGNED_KEY = "__unassigned__";

type TabId = "newedge" | "classics";

export function CoursesListClient() {
	const t = useTranslations("CoursesPage");
	const [rows, setRows] = useState<VideoListItem[] | null>(null);
	const [err, setErr] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<TabId>("newedge");

	useEffect(() => {
		let alive = true;
		async function run() {
			const res = await fetch("/api/videos/list");
			const js = (await res.json()) as { videos?: VideoListItem[]; error?: string };
			if (!alive) return;
			if (!res.ok) {
				setErr(js.error ?? "Error");
				setRows([]);
				return;
			}
			setRows(js.videos ?? []);
		}
		void run();
		return () => {
			alive = false;
		};
	}, []);

	const grouped = useMemo(() => {
		if (!rows?.length) return [];
		const map = new Map<string, { title: string; sortOrder: number; contentKind: string | null; videos: VideoListItem[] }>();

		for (const video of rows) {
			const key = video.topic_id ?? UNASSIGNED_KEY;
			const title = video.topic_title ?? t("topicUnassigned");
			const sortOrder = video.topic_sort_order;
			const contentKind = video.content_kind;
			const entry = map.get(key) ?? { title, sortOrder, contentKind, videos: [] };
			entry.videos.push(video);
			map.set(key, entry);
		}

		// 每个 group 内的视频按中文课程序号排序
		for (const [, group] of map) {
			group.videos.sort((a, b) => extractLessonOrder(a.title) - extractLessonOrder(b.title));
		}

		return [...map.entries()]
			.sort((a, b) => a[1].sortOrder - b[1].sortOrder)
			.map(([key, group]) => ({ key, ...group }));
	}, [rows, t]);

	// 分離 ai_classic 和 kol 群組
	const aiClassicGroups = useMemo(
		() => grouped.filter((g) => g.contentKind === "ai_classic"),
		[grouped],
	);
	// KOL: content_kind != "ai_classic"（包含 null、舊無分類影片）
	const kolGroups = useMemo(
		() => grouped.filter((g) => g.contentKind !== "ai_classic"),
		[grouped],
	);

	// 已分類 KOL（有明確 topic 且不是空分類）
	const categorizedKol = useMemo(
		() => kolGroups.filter((g) => g.key !== UNASSIGNED_KEY),
		[kolGroups],
	);
	// 未分類（「其他」）
	const uncategorizedKol = useMemo(
		() => kolGroups.filter((g) => g.key === UNASSIGNED_KEY),
		[kolGroups],
	);

	// 依 activeTab 過濾 ai_classic groups
	const filteredAiGroups = useMemo(() => {
		if (activeTab === "newedge") {
			return aiClassicGroups.filter((g) => g.title.includes("新銳") || g.title.includes("AI"));
		}
		return aiClassicGroups.filter((g) => g.title.includes("經典"));
	}, [aiClassicGroups, activeTab]);

	if (rows === null && !err) {
		return (
			<div className="flex justify-center py-16">
				<Loader2 className="size-8 animate-spin text-cyan-400/70" />
			</div>
		);
	}

	if (err) {
		return <p className="text-destructive text-center text-sm">{err}</p>;
	}

	if (!rows?.length) {
		return <p className="text-muted-foreground text-center text-sm">{t("empty")}</p>;
	}

	const renderVideoCard = (video: VideoListItem, idx: number, topicTitle: string) => {
		const href = `/video-player?courseId=${encodeURIComponent(video.course_id)}&videoId=${encodeURIComponent(video.id)}`;
		const isClassics = topicTitle.includes("經典");
		const borderColor = isClassics
			? "hover:border-amber-700/40"
			: "hover:border-cyan-400/40";
		const iconColor = isClassics ? "text-amber-400/80" : "text-cyan-300/80";

		return (
			<li key={video.id}>
				<Link
					href={href}
					className={cn(
						"border-border/80 bg-card/40 hover:bg-card/60 flex items-center gap-4 rounded-xl border p-4 backdrop-blur-sm transition-colors",
						borderColor,
					)}
				>
					<PlayCircle className={cn("size-6 shrink-0", iconColor)} />
					<div className="min-w-0 flex-1">
						<div className="flex items-baseline gap-2">
							<span className="text-muted-foreground tabular-nums text-xs">
								{String(idx + 1).padStart(2, "0")}
							</span>
							<h3 className="truncate text-base font-semibold">{video.title}</h3>
						</div>
						<p className="text-muted-foreground mt-1 truncate text-xs">
							{video.course_title}
							{video.duration ? ` · ${formatDuration(video.duration)}` : ""}
							{video.view_count > 0
								? ` · ${formatViewCount(video.view_count)} 人次`
								: ""}
							{video.is_free_preview ? ` · ${t("freePreview")}` : ""}
						</p>
					</div>
				</Link>
			</li>
		);
	};

	return (
		<div className="mx-auto max-w-3xl space-y-6">
			{/* === 頁籤列：始終顯示 === */}
			<div className="border-b border-border/60" role="tablist">
				<div className="flex gap-0">
					<button
						type="button"
						role="tab"
						aria-selected={activeTab === "newedge"}
						onClick={() => setActiveTab("newedge")}
						className={cn(
							"px-4 py-3 text-sm font-medium border-b-2 transition-colors",
							activeTab === "newedge"
								? "border-cyan-400 text-foreground"
								: "border-transparent text-muted-foreground hover:text-foreground",
						)}
					>
						{t("tabNewEdge")}
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={activeTab === "classics"}
						onClick={() => setActiveTab("classics")}
						className={cn(
							"px-4 py-3 text-sm font-medium border-b-2 transition-colors",
							activeTab === "classics"
								? "border-amber-600 text-foreground"
								: "border-transparent text-muted-foreground hover:text-foreground",
						)}
					>
						{t("tabClassics")}
					</button>
				</div>
			</div>

			{/* === AI+經典內容 === */}
			{filteredAiGroups.map((group) => (
				<section key={group.key} className="space-y-3">
					<h2 className="border-border/60 border-b pb-2 text-lg font-semibold tracking-tight">
						{group.title}
					</h2>
					<ul className="grid gap-3">
						{group.videos.map((video, idx) => renderVideoCard(video, idx, group.title))}
					</ul>
				</section>
			))}

			{filteredAiGroups.length === 0 && (
				<div className="py-12 text-center space-y-2">
					<p className="text-muted-foreground text-sm">
						{activeTab === "newedge" ? "豹哥正在搜尋最新交易人物故事…" : "豹叔正在整理經典交易智慧…"}
					</p>
					<p className="text-muted-foreground/60 text-xs">每週自動更新，敬請期待</p>
				</div>
			)}

			{/* === KOL 內容 === */}
			{kolGroups.length > 0 && (
				<>
					<div className="border-b border-border/60 pt-4" />
					{/* 已分類的 KOL 先顯示 */}
					{categorizedKol.map((group) => (
						<section key={group.key} className="space-y-3">
							<h2 className="border-border/60 border-b pb-2 text-lg font-semibold tracking-tight">
								{group.title}
							</h2>
							<ul className="grid gap-3">
								{group.videos.map((video, idx) => renderVideoCard(video, idx, group.title))}
							</ul>
						</section>
					))}
					{/* 未分類影片最後 */}
					{uncategorizedKol.map((group) => (
						<section key={group.key} className="space-y-3">
							<h2 className="border-border/60 border-b pb-2 text-lg font-semibold tracking-tight">
								{group.title}
							</h2>
							<ul className="grid gap-3">
								{group.videos.map((video, idx) => renderVideoCard(video, idx, group.title))}
							</ul>
						</section>
					))}
				</>
			)}
		</div>
	);
}
