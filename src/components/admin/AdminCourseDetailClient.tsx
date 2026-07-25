"use client";

import { Eye, Pencil, Play, Trash2, Upload, CheckCircle, Calendar, Clock } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Link from "next/link";

type SessionRow = {
	id: string;
	course_id: string;
	date: string;
	start_time: string;
	end_time: string;
	location: string | null;
};

type InstructorRow = { id: string; name: string; bio: string | null };

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

type VideoRow = {
	id: string;
	course_id: string;
	title: string;
	description: string | null;
	duration: number | null;
	sort_order: number;
	is_free_preview: boolean;
	view_count?: number;
	created_at: string;
	published_at: string | null;
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
	const [videos, setVideos] = useState<VideoRow[]>([]);
	const [videoTitle, setVideoTitle] = useState("");
	const [videoDesc, setVideoDesc] = useState("");
	const [videoDuration, setVideoDuration] = useState("");
	const [videoSort, setVideoSort] = useState("0");
	const [videoFreePreview, setVideoFreePreview] = useState(false);
	const [videoFile, setVideoFile] = useState<File | null>(null);
	const [videoPublishedAt, setVideoPublishedAt] = useState("");
	const [storageConfigured, setStorageConfigured] = useState(true);

	// 審片發佈台：二次確認 dialog
	const [scheduleOpen, setScheduleOpen] = useState(false);
	const [scheduleVideoId, setScheduleVideoId] = useState<string | null>(null);
	const [scheduleDate, setScheduleDate] = useState("");
	const [confirmAction, setConfirmAction] = useState<{
		open: boolean;
		title: string;
		desc: string;
		onConfirm: () => void;
	}>({ open: false, title: "", desc: "", onConfirm: () => {} });

	// QR code
	const [partnerQrUrl, setPartnerQrUrl] = useState<string | null>(null);
	const [partnerQrLabel, setPartnerQrLabel] = useState("合作夥伴");
	const [qrFile, setQrFile] = useState<File | null>(null);
	const [qrUploading, setQrUploading] = useState(false);

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
				course?: CourseRow & { partner_qr_url?: string | null; partner_qr_label?: string };
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
				setPartnerQrUrl(data.course.partner_qr_url ?? null);
				setPartnerQrLabel(data.course.partner_qr_label ?? "合作夥伴");
			}
			setSessions(data.sessions ?? []);
			setInstructorId(data.instructor_id ?? "");
			setEnrollments(data.enrollments ?? []);

			const [insRes, rosterRes, videoRes] = await Promise.all([
				fetch("/api/admin/instructors", { credentials: "include" }),
				fetch("/api/admin/roster", { credentials: "include" }),
				fetch(`/api/admin/courses/${courseId}/videos`, { credentials: "include" }),
			]);
			const insJson = (await insRes.json()) as { instructors?: InstructorRow[] };
			const rosterJson = (await rosterRes.json()) as { students?: RosterRow[] };
			const videoJson = (await videoRes.json()) as { videos?: VideoRow[]; storageConfigured?: boolean };
			if (insRes.ok) setAllInstructors(insJson.instructors ?? []);
			if (rosterRes.ok) setRoster(rosterJson.students ?? []);
			if (videoRes.ok) {
				setVideos(videoJson.videos ?? []);
				setStorageConfigured(videoJson.storageConfigured ?? true);
			}
		} catch {
			setError(t("loadError"));
		} finally {
			setLoading(false);
		}
	}, [courseId, t]);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			void load();
		}, 0);
		return () => window.clearTimeout(timer);
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

	async function uploadPartnerQr() {
		if (!qrFile) {
			setError("请先选择二维码图片（PNG/JPG）");
			return;
		}
		setQrUploading(true);
		setError(null);
		try {
			const fd = new FormData();
			fd.set("qr_image", qrFile);
			fd.set("label", partnerQrLabel.trim() || "合作夥伴");

			const res = await fetch(`/api/admin/courses/${courseId}/partner-qr`, {
				method: "POST",
				body: fd,
				credentials: "include",
			});
			const js = (await res.json()) as { error?: string; partnerQrUrl?: string };
			if (!res.ok) {
				setError(js.error ?? "上传二维码失败");
				return;
			}
			setQrFile(null);
			void load();
		} catch {
			setError("上传二维码失败");
		} finally {
			setQrUploading(false);
		}
	}

	async function setQrUrlDirect(url: string, label: string) {
		setQrUploading(true);
		setError(null);
		try {
			const res = await fetch(`/api/admin/courses/${courseId}/partner-qr`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ partner_qr_url: url, partner_qr_label: label }),
			});
			const js = (await res.json()) as { error?: string; ok?: boolean };
			if (!res.ok) {
				setError(js.error ?? "更新失败");
				return;
			}
			void load();
		} catch {
			setError("更新失败");
		} finally {
			setQrUploading(false);
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

	async function uploadVideo() {
		if (!videoFile) {
			setError("请先选择 MP4 文件");
			return;
		}
		setSaving(true);
		setError(null);
		try {
			const fd = new FormData();
			fd.set("video", videoFile);
			fd.set("title", videoTitle.trim() || videoFile.name);
			fd.set("description", videoDesc.trim());
			if (videoDuration.trim()) fd.set("duration", videoDuration.trim());
			if (videoSort.trim()) fd.set("sort_order", videoSort.trim());
			fd.set("is_free_preview", videoFreePreview ? "true" : "false");
			if (videoPublishedAt.trim()) fd.set("published_at", new Date(videoPublishedAt).toISOString());

			const res = await fetch(`/api/admin/courses/${courseId}/videos`, {
				method: "POST",
				body: fd,
				credentials: "include",
			});
			const js = (await res.json()) as { error?: string };
			if (!res.ok) {
				setError(js.error ?? "上传视频失败");
				return;
			}
			setVideoTitle("");
			setVideoDesc("");
			setVideoDuration("");
			setVideoSort("0");
			setVideoFreePreview(false);
			setVideoPublishedAt("");
			setVideoFile(null);
			void load();
		} catch {
			setError("上传视频失败");
		} finally {
			setSaving(false);
		}
	}

	async function deleteVideo(id: string) {
		setConfirmAction({
			open: true,
			title: "刪除視頻",
			desc: "確定刪除該視頻？此操作不可撤銷。",
			onConfirm: async () => {
				setConfirmAction((p) => ({ ...p, open: false }));
				const res = await fetch(`/api/admin/videos/${id}`, {
					method: "DELETE",
					credentials: "include",
				});
				if (res.ok) void load();
			},
		});
	}

	function setPublishedAt(id: string, publishedAt: string | null, label: string) {
		setConfirmAction({
			open: true,
			title: label,
			desc: publishedAt === null
				? "確定下架該視頻？下架後學員無法觀看。"
				: "確定發布該視頻？發布後學員即可觀看。",
			onConfirm: async () => {
				setConfirmAction((p) => ({ ...p, open: false }));
				setError(null);
				try {
					const res = await fetch(`/api/admin/videos/${id}`, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						credentials: "include",
						body: JSON.stringify({ published_at: publishedAt }),
					});
					if (!res.ok) {
						const js = await res.json().catch(() => ({}));
						setError((js as { error?: string }).error ?? "操作失败");
						return;
					}
					void load();
				} catch {
					setError("操作失败");
				}
			},
		});
	}

	function openScheduleDialog(videoId: string) {
		const now = new Date();
		now.setMinutes(now.getMinutes() + 1); // 至少一分鐘後
		setScheduleDate(now.toISOString().slice(0, 16));
		setScheduleVideoId(videoId);
		setScheduleOpen(true);
	}

	function confirmSchedule() {
		if (!scheduleVideoId || !scheduleDate) return;
		const dt = new Date(scheduleDate);
		setConfirmAction({
			open: true,
			title: "排程發佈",
			desc: `確認將視頻排程至 ${dt.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })} 自動發佈？`,
			onConfirm: async () => {
				setConfirmAction((p) => ({ ...p, open: false }));
				setScheduleOpen(false);
				setError(null);
				try {
					const res = await fetch(`/api/admin/videos/${scheduleVideoId}`, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						credentials: "include",
						body: JSON.stringify({ published_at: dt.toISOString() }),
					});
					if (!res.ok) {
						const js = await res.json().catch(() => ({}));
						setError((js as { error?: string }).error ?? "排程失败");
						return;
					}
					void load();
				} catch {
					setError("排程失败");
				}
			},
		});
	}

	// ── 影片狀態標籤 ──
	function videoStatusTag(v: VideoRow) {
		if (!v.published_at) {
			return <span className="text-amber-400 inline-flex items-center gap-0.5">待發佈</span>;
		}
		const pub = new Date(v.published_at);
		if (pub.getTime() > Date.now()) {
			return (
				<span className="text-sky-400 inline-flex items-center gap-0.5 ml-2">
					<Clock className="size-3" />
					排程中
				</span>
			);
		}
		return (
			<span className="text-emerald-400 inline-flex items-center gap-0.5">
				<CheckCircle className="size-3" />
				已發佈
			</span>
		);
	}

	// deprecated: kept for backward compat
	function openVideoPlayer(videoId: string) {
		window.open(`/zh/video-player?courseId=${courseId}&videoId=${videoId}`, "_blank");
	}

	function fmtTime(tstr: string) {
		return tstr?.length >= 5 ? tstr.slice(0, 5) : tstr;
	}

	if (loading && !course) {
		return <p className="text-muted-foreground text-sm">...</p>;
	}
	if (!course) {
		return <p className="text-destructive text-sm">{error ?? t("loadError")}</p>;
	}

	return (
		<div className="space-y-8">
			<p className="text-sm">
				<Link href="/cjkzt/courses" className="text-cyan-300 underline-offset-4 hover:underline">
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

			{/* 合作伙伴二维码 */}
			<Card className="border-border/60 bg-card/35">
				<CardHeader>
					<CardTitle className="text-base">合作伙伴二维码</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{partnerQrUrl ? (
						<div className="flex items-center gap-4">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src={partnerQrUrl}
								alt={partnerQrLabel}
								className="size-20 rounded-lg border border-border/40 object-contain"
							/>
							<span className="text-sm text-muted-foreground">{partnerQrLabel}</span>
						</div>
					) : (
						<p className="text-muted-foreground text-sm">尚未设置合作伙伴二维码</p>
					)}
					<div className="space-y-2">
						<Label htmlFor="qr-url">图片地址（直接粘贴 URL，无需上传）</Label>
						<Input
							id="qr-url"
							value={partnerQrUrl ?? ""}
							onChange={(e) => setPartnerQrUrl(e.target.value)}
							className="h-10"
							placeholder="/partner-qr.png 或 https://..."
						/>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="qr-image">二维码图片（PNG/JPG）</Label>
							<Input
								id="qr-image"
								type="file"
								accept="image/png,image/jpeg"
								onChange={(e) => setQrFile(e.target.files?.[0] ?? null)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="qr-label">标签文字</Label>
							<Input
								id="qr-label"
								value={partnerQrLabel}
								onChange={(e) => setPartnerQrLabel(e.target.value)}
								className="h-10"
								placeholder="广发证券"
							/>
						</div>
					</div>
					<div className="flex gap-2">
						<Button
							type="button"
							disabled={qrUploading || !qrFile}
							onClick={() => void uploadPartnerQr()}
						>
							{qrUploading ? "上传中..." : "上传二维码"}
						</Button>
						<Button
							type="button"
							variant="outline"
							disabled={qrUploading || !partnerQrUrl}
							onClick={() => void setQrUrlDirect(partnerQrUrl!, partnerQrLabel)}
						>
							更新标签
						</Button>
					</div>
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
								{s.date} {fmtTime(s.start_time)}-{fmtTime(s.end_time)}
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
						{t("enrollTitle")} · {enrollments.length}/{capacity}
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
				<div className="flex flex-wrap gap-2">
					<select
						value={pickStudent}
						onChange={(e) => setPickStudent(e.target.value)}
						className="border-input bg-background h-10 min-w-[200px] rounded-md border px-2 text-sm"
					>
						<option value="">-</option>
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

			<Card className="border-border/60 bg-card/35">
				<CardHeader>
					<CardTitle className="text-base">课程视频（MP4）</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{!storageConfigured ? (
						<p className="text-sm text-amber-300">
							视频存储未配置（请设置 VIDEO_STORAGE_PROVIDER/BUCKET/ENDPOINT/ACCESS_KEY/SECRET）。
						</p>
					) : null}
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-2 sm:col-span-2">
							<Label htmlFor="video-file">视频文件（MP4）</Label>
							<Input
								id="video-file"
								type="file"
								accept="video/mp4"
								onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="video-title">标题</Label>
							<Input
								id="video-title"
								value={videoTitle}
								onChange={(e) => setVideoTitle(e.target.value)}
								className="h-10"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="video-duration">时长（秒，可选）</Label>
							<Input
								id="video-duration"
								type="number"
								min={0}
								value={videoDuration}
								onChange={(e) => setVideoDuration(e.target.value)}
								className="h-10"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="video-sort">排序</Label>
							<Input
								id="video-sort"
								type="number"
								min={0}
								value={videoSort}
								onChange={(e) => setVideoSort(e.target.value)}
								className="h-10"
							/>
						</div>
						<div className="flex items-center gap-2 self-end pb-2">
							<input
								id="video-free-preview"
								type="checkbox"
								checked={videoFreePreview}
								onChange={(e) => setVideoFreePreview(e.target.checked)}
							/>
							<Label htmlFor="video-free-preview">免费预览</Label>
						</div>
						<div className="space-y-2">
							<Label htmlFor="video-publish-at">發佈時間（留空=立即，填未來=排程）</Label>
							<Input
								id="video-publish-at"
								type="datetime-local"
								value={videoPublishedAt}
								onChange={(e) => setVideoPublishedAt(e.target.value)}
								className="h-10"
							/>
						</div>
						<div className="space-y-2 sm:col-span-2">
							<Label htmlFor="video-desc">简介（可选）</Label>
							<Textarea
								id="video-desc"
								value={videoDesc}
								onChange={(e) => setVideoDesc(e.target.value)}
								className="min-h-[72px]"
							/>
						</div>
					</div>
					<Button
						type="button"
						disabled={saving || !storageConfigured || !videoFile}
						onClick={() => void uploadVideo()}
					>
						上传视频
					</Button>
					<ul className="space-y-2 text-sm">
						{videos.map((v) => (
							<li key={v.id} className="border-border/40 rounded-lg border px-3 py-2">
								<div className="flex items-center justify-between gap-2">
									<div className="flex-1 min-w-0">
										<div className="font-medium truncate">{v.title}</div>
										<div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-1">
											<span>#{v.sort_order} · {v.duration ? `${v.duration}s` : "时长未设置"}</span>
											{v.view_count != null ? (
												<span className="inline-flex items-center gap-0.5">
													<Eye className="size-3" />
													{v.view_count} 人次
												</span>
											) : null}
											{videoStatusTag(v)}
										</div>
									</div>
									<div className="flex items-center gap-1 shrink-0">
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="size-7 text-cyan-300/80 hover:text-cyan-300"
											title="預覽播放"
											onClick={() => openVideoPlayer(v.id)}
										>
											<Play className="size-3.5" />
										</Button>
										{!v.published_at ? (
											<>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													className="h-7 px-2 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/20"
													onClick={() =>
														setPublishedAt(v.id, new Date().toISOString(), "立即發佈")
													}
												>
													發佈
												</Button>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													className="h-7 px-2 text-xs text-sky-400 hover:text-sky-300 hover:bg-sky-900/20"
													onClick={() => openScheduleDialog(v.id)}
												>
													<Calendar className="size-3 mr-0.5" />
													排程
												</Button>
											</>
										) : (
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-900/20"
												onClick={() =>
													setPublishedAt(v.id, null, "下架")
												}
											>
												下架
											</Button>
										)}
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="size-7 text-destructive/70 hover:text-destructive"
											title="删除"
											onClick={() => void deleteVideo(v.id)}
										>
											<Trash2 className="size-3.5" />
										</Button>
									</div>
								</div>
							</li>
						))}
						{videos.length === 0 ? <li className="text-muted-foreground">暂无视频</li> : null}
					</ul>
				</CardContent>
			</Card>

			{/* 二次確認 Dialog */}
			<Dialog
				open={confirmAction.open}
				onOpenChange={(open) => {
					if (!open) setConfirmAction((p) => ({ ...p, open: false }));
				}}
			>
				<DialogContent showCloseButton={false}>
					<DialogHeader>
						<DialogTitle>{confirmAction.title}</DialogTitle>
						<DialogDescription>{confirmAction.desc}</DialogDescription>
					</DialogHeader>
					<DialogFooter showCloseButton closeLabel="取消">
						<Button variant="default" onClick={confirmAction.onConfirm}>
							確認
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* 排程發佈 Dialog */}
			<Dialog
				open={scheduleOpen}
				onOpenChange={(open) => {
					if (!open) { setScheduleOpen(false); setScheduleVideoId(null); }
				}}
			>
				<DialogContent showCloseButton={false}>
					<DialogHeader>
						<DialogTitle>排程發佈</DialogTitle>
						<DialogDescription>
							設定未來時間，影片將在該時間自動發佈。
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2">
						<Label htmlFor="schedule-datetime">發佈時間</Label>
						<Input
							id="schedule-datetime"
							type="datetime-local"
							value={scheduleDate}
							onChange={(e) => setScheduleDate(e.target.value)}
							className="h-10"
						/>
					</div>
					<DialogFooter showCloseButton closeLabel="取消">
						<Button variant="default" onClick={confirmSchedule} disabled={!scheduleDate}>
							確認排程
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
