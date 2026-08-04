"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type PublishStatus = "draft" | "scheduled" | "live";

type VideoRow = {
	id: string;
	course_id: string;
	course_title: string;
	title: string;
	duration: number | null;
	created_at: string;
	published_at: string | null;
	publish_status: PublishStatus;
	storage_key: string;
};

const STATUS_LABEL: Record<PublishStatus, string> = {
	draft: "草稿",
	scheduled: "已排程",
	live: "已上架",
};

function formatWhen(iso: string | null): string {
	if (!iso) return "—";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString("zh-CN", { hour12: false });
}

export function AdminVideoPublishPanel() {
	const [tab, setTab] = useState<"draft" | "scheduled" | "live" | "all">("draft");
	const [rows, setRows] = useState<VideoRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [scheduleForId, setScheduleForId] = useState<string | null>(null);
	const [scheduleLocal, setScheduleLocal] = useState("");
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [previewTitle, setPreviewTitle] = useState<string | null>(null);
	const [publishedAtAvailable, setPublishedAtAvailable] = useState(true);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/admin/videos?status=${tab}`, { credentials: "include" });
			const data = (await res.json()) as {
				videos?: VideoRow[];
				publishedAtAvailable?: boolean;
				error?: string;
			};
			if (!res.ok) {
				setError(data.error ?? "加载失败");
				return;
			}
			setRows(data.videos ?? []);
			setPublishedAtAvailable(data.publishedAtAvailable !== false);
		} catch {
			setError("加载失败");
		} finally {
			setLoading(false);
		}
	}, [tab]);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			void load();
		}, 0);
		return () => window.clearTimeout(timer);
	}, [load]);

	async function patchPublishedAt(row: VideoRow, publishedAt: string | null) {
		setBusyId(row.id);
		setError(null);
		try {
			const res = await fetch(`/api/admin/courses/${row.course_id}/videos/${row.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ published_at: publishedAt }),
			});
			const data = (await res.json()) as { error?: string };
			if (!res.ok) {
				setError(data.error ?? "操作失败");
				return;
			}
			setScheduleForId(null);
			void load();
		} catch {
			setError("操作失败");
		} finally {
			setBusyId(null);
		}
	}

	async function preview(row: VideoRow) {
		setBusyId(row.id);
		setError(null);
		setPreviewUrl(null);
		setPreviewTitle(row.title);
		try {
			const res = await fetch(`/api/admin/courses/${row.course_id}/videos/${row.id}/play`, {
				credentials: "include",
			});
			const data = (await res.json()) as { playUrl?: string; error?: string };
			if (!res.ok || !data.playUrl) {
				setError(data.error ?? "预览失败");
				return;
			}
			setPreviewUrl(data.playUrl);
		} catch {
			setError("预览失败");
		} finally {
			setBusyId(null);
		}
	}

	function submitSchedule(row: VideoRow) {
		if (!scheduleLocal) {
			setError("请选择排程时间");
			return;
		}
		const iso = new Date(scheduleLocal).toISOString();
		void patchPublishedAt(row, iso);
	}

	return (
		<div className="space-y-4">
			<div>
				<h1 className="font-heading text-2xl font-semibold tracking-tight">审片发布台</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					草稿预览、立即发布、排程上架、下架。管线成片默认草稿，须人工发布。
				</p>
			</div>

			{!publishedAtAvailable ? (
				<p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
					尚未检测到 published_at 字段，请先执行数据库迁移后再使用发布操作。
				</p>
			) : null}

			{error ? (
				<p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
					{error}
				</p>
			) : null}

			{previewUrl ? (
				<div className="space-y-2 rounded-lg border p-3">
					<div className="flex items-center justify-between gap-2">
						<p className="text-sm font-medium">预览：{previewTitle}</p>
						<Button type="button" variant="ghost" size="sm" onClick={() => setPreviewUrl(null)}>
							关闭
						</Button>
					</div>
					{/* eslint-disable-next-line jsx-a11y/media-has-caption */}
					<video src={previewUrl} controls className="max-h-[420px] w-full rounded-md bg-black" />
				</div>
			) : null}

			<Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
				<TabsList>
					<TabsTrigger value="draft">草稿</TabsTrigger>
					<TabsTrigger value="scheduled">已排程</TabsTrigger>
					<TabsTrigger value="live">已上架</TabsTrigger>
					<TabsTrigger value="all">全部</TabsTrigger>
				</TabsList>
				<TabsContent value={tab} className="mt-4">
					{loading ? (
						<p className="text-muted-foreground text-sm">加载中…</p>
					) : rows.length === 0 ? (
						<p className="text-muted-foreground text-sm">暂无视频</p>
					) : (
						<div className="overflow-x-auto rounded-lg border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>标题</TableHead>
										<TableHead>课程</TableHead>
										<TableHead>状态</TableHead>
										<TableHead>发布时间</TableHead>
										<TableHead>创建</TableHead>
										<TableHead className="text-right">操作</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{rows.map((row) => {
										const busy = busyId === row.id;
										return (
											<TableRow key={row.id}>
												<TableCell className="max-w-[220px] font-medium">{row.title}</TableCell>
												<TableCell className="text-muted-foreground max-w-[160px] truncate">
													{row.course_title}
												</TableCell>
												<TableCell>
													<span
														className={cn(
															"inline-flex rounded-full px-2 py-0.5 text-xs",
															row.publish_status === "live" && "bg-emerald-500/15 text-emerald-700",
															row.publish_status === "draft" && "bg-muted text-muted-foreground",
															row.publish_status === "scheduled" && "bg-sky-500/15 text-sky-700",
														)}
													>
														{STATUS_LABEL[row.publish_status]}
													</span>
												</TableCell>
												<TableCell className="text-sm">{formatWhen(row.published_at)}</TableCell>
												<TableCell className="text-sm">{formatWhen(row.created_at)}</TableCell>
												<TableCell className="text-right">
													<div className="flex flex-wrap items-center justify-end gap-2">
														<Button
															type="button"
															size="sm"
															variant="outline"
															disabled={busy}
															onClick={() => void preview(row)}
														>
															预览
														</Button>
														{row.publish_status !== "live" ? (
															<Button
																type="button"
																size="sm"
																disabled={busy || !publishedAtAvailable}
																onClick={() => void patchPublishedAt(row, new Date().toISOString())}
															>
																立即发布
															</Button>
														) : null}
														{row.publish_status !== "draft" ? (
															<Button
																type="button"
																size="sm"
																variant="outline"
																disabled={busy || !publishedAtAvailable}
																onClick={() => void patchPublishedAt(row, null)}
															>
																下架
															</Button>
														) : null}
														{scheduleForId === row.id ? (
															<div className="flex items-center gap-2">
																<Input
																	type="datetime-local"
																	value={scheduleLocal}
																	onChange={(e) => setScheduleLocal(e.target.value)}
																	className="h-8 w-[190px]"
																/>
																<Button
																	type="button"
																	size="sm"
																	disabled={busy || !publishedAtAvailable}
																	onClick={() => submitSchedule(row)}
																>
																	确认
																</Button>
																<Button
																	type="button"
																	size="sm"
																	variant="ghost"
																	onClick={() => setScheduleForId(null)}
																>
																	取消
																</Button>
															</div>
														) : (
															<Button
																type="button"
																size="sm"
																variant="ghost"
																disabled={busy || !publishedAtAvailable}
																onClick={() => {
																	setScheduleForId(row.id);
																	setScheduleLocal("");
																}}
															>
																排程
															</Button>
														)}
													</div>
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						</div>
					)}
				</TabsContent>
			</Tabs>
		</div>
	);
}
