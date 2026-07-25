"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Eye, Lock } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { formatViewCount } from "@/lib/analytics/format";

type PlayResponse = {
	playUrl?: string;
	expiresIn?: number;
	error?: string;
	// trial mode
	trial?: boolean;
	trialDuration?: number;
	// course access
	hasCourseAccess?: boolean;
	// points
	pointsConsumed?: number;
	balance?: number;
	requiresPoints?: number;
	// display
	viewCount?: number;
	partnerQrUrl?: string | null;
	partnerQrLabel?: string;
	// orientation
	contentKind?: string | null;
	// quota
	quotaRemaining?: number | null;
	quotaExhausted?: boolean;
	plan?: string;
	quotaMinutes?: number;
	consumedSeconds?: number;
	remainingSeconds?: number;
	remainingMinutes?: number;
	upgradePrompt?: string;
};

type ProgressResponse = {
	position?: number;
	completed?: boolean;
};

export function VideoPlayerClient() {
	const search = useSearchParams();
	const courseId = search.get("courseId") ?? "";
	const videoId = search.get("videoId") ?? "";

	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [playUrl, setPlayUrl] = useState<string>("");
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const timerRef = useRef<number | null>(null);
	const videoIdRef = useRef(videoId);
	videoIdRef.current = videoId;

	// Display states
	const [viewCount, setViewCount] = useState<number>(0);
	const [isTrial, setIsTrial] = useState(false);
	const [trialEnded, setTrialEnded] = useState(false);
	const [trialDuration, setTrialDuration] = useState(180);
	const [requiresPoints, setRequiresPoints] = useState<number | null>(null);
	const [pointsBalance, setPointsBalance] = useState<number | null>(null);
	const [pointsConsumed, setPointsConsumed] = useState<number | null>(null);
	const [contentKind, setContentKind] = useState<string | null>(null);
	const isVertical = contentKind === "ai_classic";

	const playApi = useMemo(() => {
		if (!courseId || !videoId) return "";
		return `/api/courses/${encodeURIComponent(courseId)}/videos/${encodeURIComponent(videoId)}/play`;
	}, [courseId, videoId]);

	// 進度回報：依賴為空，引用永遠穩定，避免觸發主 effect 重跑導致視頻重新載入
	const reportProgress = useCallback(
		async (forceCompleted = false) => {
			const el = videoRef.current;
			const vid = videoIdRef.current;
			if (!el || !vid) return;
			const position = Math.max(0, Math.floor(el.currentTime || 0));
			try {
				await fetch("/api/courses/video/progress", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: "include",
					body: JSON.stringify({
						videoId: vid,
						position,
						completed: forceCompleted || (el.duration > 0 && position >= Math.floor(el.duration - 1)),
					}),
				});
			} catch {
				// 遊客或網路錯誤，忽略
			}
		},
		[],
	);

	// Trial timer: pause at trialDuration seconds
	const handleTimeUpdate = useCallback(() => {
		const el = videoRef.current;
		if (!el || !isTrial || trialEnded) return;
		if (el.currentTime >= trialDuration) {
			el.pause();
			setTrialEnded(true);
		}
	}, [isTrial, trialEnded, trialDuration]);

	useEffect(() => {
		let alive = true;
		async function run() {
			if (!playApi || !videoId) {
				setError("参数错误");
				setLoading(false);
				return;
			}

			try {
				const [playRes, progressRes] = await Promise.all([
					fetch(playApi, { credentials: "include" }),
					fetch(`/api/courses/video/progress?videoId=${encodeURIComponent(videoId)}`, {
						credentials: "include",
					}),
				]);
				const playJson = (await playRes.json()) as PlayResponse;
				const progressJson = (await progressRes.json()) as ProgressResponse;
				if (!alive) return;

				// Handle error responses
				if (!playRes.ok) {
					// requiresPoints (402)
					if (playRes.status === 402 && playJson.requiresPoints != null) {
						setRequiresPoints(playJson.requiresPoints);
						setPointsBalance(playJson.balance ?? 0);
						setLoading(false);
						return;
					}
					setError(playJson.error ?? "无权限观看，请先购买课程或获取积分");
					setLoading(false);
					return;
				}

				if (!playJson.playUrl) {
					setError("播放地址获取失败");
					setLoading(false);
					return;
				}

				setPlayUrl(playJson.playUrl);
				setViewCount(playJson.viewCount ?? 0);

			if (playJson.trial) {
				setIsTrial(true);
				if (playJson.trialDuration && playJson.trialDuration > 0) {
					setTrialDuration(playJson.trialDuration);
				}
			}
				if (playJson.pointsConsumed != null) {
					setPointsConsumed(playJson.pointsConsumed);
				}
				setContentKind(playJson.contentKind ?? null);

				setLoading(false);

				window.setTimeout(() => {
					const el = videoRef.current;
					if (!el) return;
					const saved = Number(progressJson.position ?? 0);
					if (saved > 0 && Number.isFinite(saved)) {
						el.currentTime = saved;
					}
				}, 300);
			} catch {
				if (!alive) return;
				setError("加载播放地址失败");
				setLoading(false);
			}
		}
		void run();

		return () => {
			alive = false;
			if (timerRef.current) window.clearInterval(timerRef.current);
			void reportProgress(false);
		};
	}, [playApi, videoId]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		if (!playUrl) return;
		timerRef.current = window.setInterval(() => {
			void reportProgress(false);
		}, 10_000);
		return () => {
			if (timerRef.current) window.clearInterval(timerRef.current);
		};
	}, [playUrl, reportProgress]);

	// Loading
	if (loading) {
		return (
			<div className="flex items-center justify-center py-16 text-muted-foreground">
				<svg className="mr-2 size-5 animate-spin" viewBox="0 0 24 24" fill="none">
					<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
					<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
				</svg>
				视频加载中...
			</div>
		);
	}

	// Error
	if (error) {
		return (
			<div className="space-y-4 rounded-xl border border-border/70 bg-card/35 p-6">
				<p className="flex items-center gap-2 text-sm text-amber-300">
					<AlertTriangle className="size-4 shrink-0" />
					{error}
				</p>
				<Link href="/courses" className={cn(buttonVariants({ variant: "outline" }))}>
					返回课程列表
				</Link>
			</div>
		);
	}

	// Points required
	if (requiresPoints != null) {
		return (
			<div className="space-y-4 rounded-xl border border-border/70 bg-card/35 p-6">
				<div className="flex items-center gap-2 text-sm text-amber-300">
					<Lock className="size-4 shrink-0" />
					需要 {requiresPoints} 积分观看此视频
				</div>
				{pointsBalance != null ? (
					<p className="text-muted-foreground text-sm">
						当前积分：{pointsBalance}{" "}
						{pointsBalance < requiresPoints ? "(不足)" : ""}
					</p>
				) : null}
				<div className="flex gap-3">
					<Link href="/points" className={cn(buttonVariants({ variant: "default" }))}>
						获取积分
					</Link>
					<Link href="/courses" className={cn(buttonVariants({ variant: "outline" }))}>
						返回课程列表
					</Link>
				</div>
			</div>
		);
	}

	// Trial ended
	if (trialEnded) {
		return (
			<div className="space-y-4 rounded-xl border border-border/70 bg-card/35 p-6">
				<div className="flex items-center gap-2 text-sm text-amber-300">
					<Lock className="size-4 shrink-0" />
					免费观看已到，请完成注册继续观看
				</div>
				<div className="flex gap-3">
					<Link href="/register" className={cn(buttonVariants({ variant: "default" }))}>
						立即注册
					</Link>
					<Link href="/courses" className={cn(buttonVariants({ variant: "outline" }))}>
						返回教学视频列表
					</Link>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{isVertical ? (
				/* === 竖屏布局（豹哥/豹叔 ai_classic） === */
				<>
					<div className="mx-auto max-w-sm">
						{/* 视频区 — 9:16 竖屏容器 */}
						<div className="relative aspect-[9/16] w-full overflow-hidden rounded-xl bg-black">
							{/* 返回按钮 — 左上浮层 */}
							<Link
								href="/courses"
								className={cn(
									buttonVariants({ variant: "ghost", size: "sm" }),
									"absolute left-3 z-10 bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 hover:text-white",
								)}
								style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
							>
								← 返回课程
							</Link>
							<video
								ref={videoRef}
								playsInline
								controls
								className="size-full object-contain"
								src={playUrl}
								onTimeUpdate={handleTimeUpdate}
								onEnded={() => {
									void reportProgress(true);
								}}
							/>
						</div>
					</div>

					{/* 信息卡片区 — 视频下方独立区域 */}
					<div className="mx-auto max-w-sm space-y-3 rounded-xl border border-border/60 bg-card/60 p-4">
						{/* 观看人次 */}
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							<Eye className="size-3.5" />
							{formatViewCount(viewCount)} 人次观看
						</div>

						{/* 试看提示 */}
						{isTrial && !trialEnded ? (
							<div className="flex items-center gap-2 text-xs text-amber-300">
								<AlertTriangle className="size-3.5" />
								免费试看 10 秒 · 登录后完整观看
							</div>
						) : null}

						{/* 积分消耗提示 */}
						{pointsConsumed != null ? (
							<div className="text-xs text-cyan-300">已消耗 {pointsConsumed} 积分</div>
						) : null}

						{/* 合作伙伴二维码 */}
						<div className="flex justify-center pt-1">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src="/partner-qr.png"
								alt="广发证券"
								className="w-24 rounded-lg border border-border/40 bg-card shadow-sm"
								draggable={false}
							/>
						</div>
					</div>
				</>
			) : (
				/* === 横屏/自适应布局（KOL 以及其他） === */
				<>
					<video
						ref={videoRef}
						controls
						playsInline
						className="w-full rounded-xl border border-border/60 bg-black"
						src={playUrl}
						onTimeUpdate={handleTimeUpdate}
						onEnded={() => {
							void reportProgress(true);
						}}
					/>

					{/* 视频信息栏 */}
					<div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-muted-foreground text-xs">
						{/* 观看人次 */}
						<span className="inline-flex items-center gap-1">
							<Eye className="size-3.5" />
							{formatViewCount(viewCount)} 人次观看
						</span>

						{/* 试看提示 */}
						{isTrial && !trialEnded ? (
							<span className="inline-flex items-center gap-1 text-amber-300">
								<AlertTriangle className="size-3.5" />
								免费试看 10 秒 · 登录后完整观看
							</span>
						) : null}

						{/* 积分消耗提示 */}
						{pointsConsumed != null ? (
							<span className="text-cyan-300">已消耗 {pointsConsumed} 积分</span>
						) : null}
					</div>

					{/* 广发证券二维码嵌入 */}
					<div className="flex justify-center py-2">
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src="/partner-qr.png"
							alt="广发证券"
							className="w-32 rounded-lg border border-border/40 bg-card shadow-sm sm:w-36"
							draggable={false}
						/>
					</div>
				</>
			)}
		</div>
	);
}
