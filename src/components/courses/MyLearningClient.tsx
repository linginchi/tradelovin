"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import TqScoreCard from "@/components/courses/TqScoreCard";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type ScoreRow = {
	score: number | null;
	grade: string | null;
	certificate_url: string | null;
	uploaded_at?: string;
};

type CourseInfo = {
	id: string;
	title: string;
	mode: string | null;
	start_date: string | null;
	end_date: string | null;
	location: string | null;
	cover_image: string | null;
	instructor_label: string | null;
};

type RegRow = {
	id: string;
	status: string;
	applied_at: string;
	courses?: CourseInfo | null;
	course_scores?: ScoreRow[] | null;
};

type ApiScoreItem = {
	courseId: string;
	courseTitle: string;
	score: number | null;
	grade: string | null;
	certificateUrl: string | null;
};

type TqScore = {
	totalScore: number;
	calcTime?: string;
	meta?: {
		tradeCount?: number;
		minTradesForScore?: number;
		eligible?: boolean;
	};
	dimensions: {
		profitability: number;
		riskControl: number;
		consistency: number;
		activeness: number;
	};
};

type TqPeriod = "all" | "monthly" | "weekly" | "daily";

type TqFeatureItem = {
	featureName: string;
	rawValue: number;
	normScore: number;
	calcTime?: string;
};

type RadarGroupPayload = {
	id: string;
	label: string;
	axes: Array<{ id: string; label: string; score: number }>;
};

type TqCertificate = {
	id: number;
	tier: "T1" | "T2" | "T3";
	issuedAt: string;
	pdfUrl: string;
	imageUrl: string;
	templateVersion: string;
};

function formatSchedule(start: string | null, end: string | null, locale: string): string {
	if (!start && !end) return "—";
	const loc = locale === "zh-TW" ? "zh-Hant" : locale === "en" ? "en" : "zh-CN";
	const df = new Intl.DateTimeFormat(loc, { dateStyle: "medium" });
	const a = start ? df.format(new Date(start)) : "—";
	const b = end ? df.format(new Date(end)) : "—";
	if (start && end && start.slice(0, 10) !== end.slice(0, 10)) {
		return `${a} – ${b}`;
	}
	return start ? a : b;
}

function pickLatestScore(scores: ScoreRow[] | null | undefined): ScoreRow | null {
	if (!scores?.length) return null;
	return [...scores].sort(
		(a, b) =>
			new Date(b.uploaded_at ?? 0).getTime() - new Date(a.uploaded_at ?? 0).getTime(),
	)[0] ?? null;
}

function statusBadgeClass(status: string) {
	if (status === "approved") {
		return "bg-emerald-500/15 text-emerald-300 ring-emerald-400/35";
	}
	if (status === "rejected") {
		return "bg-red-500/12 text-red-300 ring-red-400/30";
	}
	return "bg-amber-500/15 text-amber-200 ring-amber-400/35";
}

export default function MyLearningClient() {
	const t = useTranslations("MyLearningPage");
	const tc = useTranslations("CoursesPage");
	const tProfile = useTranslations("MyProfile");
	const locale = useLocale();

	const [rows, setRows] = useState<RegRow[] | null>(null);
	const [scoreMap, setScoreMap] = useState<Map<string, ApiScoreItem>>(() => new Map());
	const [tqEnv, setTqEnv] = useState<"sim" | "live">("sim");
	const [tqPeriod, setTqPeriod] = useState<TqPeriod>("all");
	const [tq, setTq] = useState<TqScore | null>(null);
	const [tqFeatures, setTqFeatures] = useState<TqFeatureItem[]>([]);
	const [tqRadarGroups, setTqRadarGroups] = useState<RadarGroupPayload[]>([]);
	const [tqTrend, setTqTrend] = useState<Array<{ period: TqPeriod; totalScore: number }>>([]);
	const [tqCertificate, setTqCertificate] = useState<TqCertificate | null>(null);
	const [certBusy, setCertBusy] = useState(false);
	const [tqLoading, setTqLoading] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	useEffect(() => {
		let alive = true;
		async function run() {
			const [regRes, scoreRes] = await Promise.all([
				fetch("/api/courses/my-registrations", { credentials: "include" }),
				fetch("/api/courses/my-scores", { credentials: "include" }),
			]);
			const regJson = (await regRes.json()) as {
				success?: boolean;
				registrations?: RegRow[];
				error?: string;
			};
			const scoreJson = (await scoreRes.json()) as {
				success?: boolean;
				scores?: ApiScoreItem[];
				error?: string;
			};
			if (!alive) return;

			if (regRes.status === 401) {
				setErr("401");
				setRows([]);
				return;
			}
			if (!regRes.ok || !regJson.success) {
				setErr(regJson.error ?? "Error");
				setRows([]);
				return;
			}

			const m = new Map<string, ApiScoreItem>();
			if (scoreRes.ok && scoreJson.success && scoreJson.scores?.length) {
				for (const s of scoreJson.scores) {
					if (s.courseId) m.set(s.courseId, s);
				}
			}
			setScoreMap(m);
			setRows(regJson.registrations ?? []);
		}
		void run();
		return () => {
			alive = false;
		};
	}, []);

	useEffect(() => {
		let alive = true;
		async function loadTq() {
			setTqLoading(true);
			try {
				const [scoreRes, featureRes, radarRes, certRes] = await Promise.all([
					fetch(`/api/tq/score?env=${tqEnv}&period=${tqPeriod}`, { credentials: "include" }),
					fetch(`/api/tq/features?env=${tqEnv}&period=${tqPeriod}`, { credentials: "include" }),
					fetch(`/api/tq/radar?env=${tqEnv}&period=${tqPeriod}`, { credentials: "include" }),
					fetch(`/api/tq/certificates?env=${tqEnv}&period=${tqPeriod}`, { credentials: "include" }),
				]);
				const trendPeriods: TqPeriod[] = ["all", "monthly", "weekly", "daily"];
				const trendResponses = await Promise.all(
					trendPeriods.map((period) =>
						fetch(`/api/tq/score?env=${tqEnv}&period=${period}`, { credentials: "include" }),
					),
				);
				const scoreJson = (await scoreRes.json()) as {
					success?: boolean;
					data?: {
						totalScore: number;
						calcTime?: string;
						meta?: TqScore["meta"];
						dimensions: {
							profitability: number;
							riskControl: number;
							consistency: number;
							activeness: number;
						};
					};
				};
				const featureJson = (await featureRes.json()) as {
					success?: boolean;
					data?: TqFeatureItem[];
				};
				const radarJson = (await radarRes.json()) as {
					success?: boolean;
					data?: { radar?: { groups?: RadarGroupPayload[] } };
				};
				const certJson = (await certRes.json()) as { success?: boolean; data?: TqCertificate | null };
				if (!alive) return;
				if (!scoreRes.ok || !scoreJson.success || !scoreJson.data) {
					setTq(null);
					setTqFeatures([]);
					setTqRadarGroups([]);
					setTqTrend([]);
					return;
				}
				const trendJsons = await Promise.all(
					trendResponses.map(
						async (res) =>
							(await res.json()) as {
								success?: boolean;
								data?: { totalScore?: number };
							},
					),
				);
				setTq({
					totalScore: scoreJson.data.totalScore ?? 0,
					calcTime: scoreJson.data.calcTime,
					meta: scoreJson.data.meta,
					dimensions: scoreJson.data.dimensions,
				});
				setTqFeatures(featureRes.ok && featureJson.success ? (featureJson.data ?? []) : []);
				setTqRadarGroups(
					radarRes.ok && radarJson.success ? (radarJson.data?.radar?.groups ?? []) : [],
				);
				setTqCertificate(certRes.ok && certJson.success ? (certJson.data ?? null) : null);
				setTqTrend(
					trendPeriods.map((period, idx) => ({
						period,
						totalScore:
							trendResponses[idx]?.ok && trendJsons[idx]?.success
								? Number(trendJsons[idx]?.data?.totalScore ?? 0)
								: 0,
					})),
				);
			} finally {
				if (alive) setTqLoading(false);
			}
		}
		void loadTq();
		return () => {
			alive = false;
		};
	}, [tqEnv, tqPeriod]);

	async function issueCertificate() {
		try {
			setCertBusy(true);
			const res = await fetch("/api/tq/certificates", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ env: tqEnv, period: tqPeriod }),
			});
			const json = (await res.json()) as { success?: boolean; error?: string; data?: TqCertificate };
			if (!res.ok || !json.success || !json.data) {
				setErr(json.error ?? "证书生成失败");
				return;
			}
			setTqCertificate(json.data);
		} finally {
			setCertBusy(false);
		}
	}

	if (rows === null && !err) {
		return (
			<div className="flex justify-center py-16">
				<Loader2 className="size-8 animate-spin text-cyan-400/70" />
			</div>
		);
	}

	if (err === "401") {
		return (
			<p className="text-muted-foreground text-center text-sm">
				{tc("needLogin")}
				{" · "}
				<Link href="/login" className="text-cyan-300 underline-offset-4 hover:underline">
					{t("loginCta")}
				</Link>
			</p>
		);
	}

	if (err) {
		return <p className="text-destructive text-center text-sm">{err}</p>;
	}

	const legacyEnrolled = tProfile.raw("enrolled") as Array<{
		name: string;
		progress: string;
		status: string;
	}>;

	return (
		<div className="mx-auto max-w-3xl space-y-5">
			<div className="rounded-xl border border-orange-300/50 bg-orange-500/10 px-4 py-3 shadow-[0_0_0_1px_rgba(251,146,60,0.2)]">
				<p className="text-sm font-semibold text-orange-300">{t("courseTeaser")}</p>
			</div>

			<div className="flex justify-start">
				<Link
					href="/courses"
					className="rounded-lg border border-orange-300/45 bg-orange-500/10 px-3 py-1.5 text-sm font-medium text-orange-200 transition-colors hover:bg-orange-500/20"
				>
					{t("browseAllCourses")}
				</Link>
			</div>

			<section className="space-y-3">
				<h2 className="text-base font-semibold tracking-tight">{t("courseInfoTitle")}</h2>
				{rows?.length ? (
					<ul className="space-y-3">
						{rows.map((r) => {
							const c = r.courses;
							const title = c?.title ?? "—";
							const modeLabel =
								c?.mode === "online"
									? tc("modeOnline")
									: c?.mode === "offline"
										? tc("modeOffline")
										: null;
							const statusLabel =
								r.status === "pending"
									? tc("pending")
									: r.status === "approved"
										? tc("approved")
										: tc("rejected");

							return (
								<li
									key={`course-${r.id}`}
									className="border-border/80 bg-card/45 rounded-2xl border p-4 shadow-[0_0_0_1px_oklch(0.55_0.14_195/0.08)]"
								>
									<div className="flex flex-wrap items-start justify-between gap-2">
										<div className="min-w-0">
											<p className="text-sm font-semibold">{title}</p>
											<p className="text-muted-foreground mt-1 text-xs">
												{c?.instructor_label
													? `${t("instructor")}：${c.instructor_label}`
													: t("instructorTbd")}
											</p>
											<p className="text-muted-foreground mt-0.5 text-xs">
												{t("schedule")}：
												{formatSchedule(c?.start_date ?? null, c?.end_date ?? null, locale)}
												{modeLabel ? ` · ${modeLabel}` : ""}
												{c?.location ? ` · ${c.location}` : ""}
											</p>
										</div>
										<span
											className={cn(
												"shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1",
												statusBadgeClass(r.status),
											)}
										>
											{statusLabel}
										</span>
									</div>
								</li>
							);
						})}
					</ul>
				) : legacyEnrolled.length ? (
					<ul className="space-y-3">
						{legacyEnrolled.map((item) => (
							<li
								key={`legacy-${item.name}`}
								className="border-border/80 bg-card/45 rounded-2xl border p-4 shadow-[0_0_0_1px_oklch(0.55_0.14_195/0.08)]"
							>
								<p className="text-sm font-semibold">{item.name}</p>
								<p className="text-muted-foreground mt-1 text-xs">{item.progress}</p>
								<p className="text-muted-foreground mt-0.5 text-xs">{item.status}</p>
							</li>
						))}
					</ul>
				) : (
					<p className="text-muted-foreground text-sm">{t("empty")}</p>
				)}
			</section>

			<section className="space-y-3">
				<h2 className="text-base font-semibold tracking-tight">{t("tqSectionTitle")}</h2>
				<TqScoreCard
					locale={locale}
					tqEnv={tqEnv}
					onEnvChange={setTqEnv}
					tqPeriod={tqPeriod}
					onPeriodChange={setTqPeriod}
					loading={tqLoading}
					tq={tq}
					tqFeatures={tqFeatures}
					radarGroups={tqRadarGroups}
					trendPoints={tqTrend}
					updateHint={t("tqUpdateCadence")}
				/>
				<div className="border-border/60 bg-card/35 rounded-xl border p-3 text-sm">
					<div className="flex flex-wrap items-center gap-2">
						<button
							type="button"
							onClick={() => void issueCertificate()}
							disabled={certBusy}
							className="rounded-md border border-cyan-400/40 bg-cyan-500/10 px-3 py-1.5 text-cyan-200 disabled:opacity-60"
						>
							{certBusy ? "生成中..." : "生成 TQ 评价证书"}
						</button>
						{tqCertificate ? (
							<>
								<a
									href={tqCertificate.pdfUrl}
									target="_blank"
									rel="noreferrer"
									className="rounded-md border border-border/70 px-3 py-1.5 text-cyan-300"
								>
									下载 PDF
								</a>
								<a
									href={tqCertificate.imageUrl}
									target="_blank"
									rel="noreferrer"
									className="rounded-md border border-border/70 px-3 py-1.5 text-cyan-300"
								>
									下载图片
								</a>
								<span className="text-muted-foreground text-xs">
									{tqCertificate.tier} · {new Date(tqCertificate.issuedAt).toLocaleString("zh-CN", { hour12: false })}
								</span>
							</>
						) : null}
					</div>
				</div>
			</section>

			<section className="space-y-3">
				<h2 className="text-base font-semibold tracking-tight">{t("mentorScoreTitle")}</h2>
				{rows?.length ? (
					<ul className="space-y-3">
					{rows.map((r) => {
						const c = r.courses;
						const title = c?.title ?? "—";
						const courseId = c?.id ?? "";
						const fromReg = pickLatestScore(r.course_scores);
						const fromApi = courseId ? scoreMap.get(courseId) : undefined;
						const latest =
							fromReg && (fromReg.score != null || fromReg.grade)
								? fromReg
								: fromApi && (fromApi.score != null || fromApi.grade)
									? {
											score: fromApi.score,
											grade: fromApi.grade,
											certificate_url: fromApi.certificateUrl,
											uploaded_at: "",
										}
									: fromReg;

						let scoreBlurb: { kind: "pending" | "learning" | "graded" | "na"; text: string } = {
							kind: "na",
							text: t("scoreNotApplicable"),
						};
						if (r.status === "pending") {
							scoreBlurb = { kind: "pending", text: t("pendingReviewScore") };
						} else if (r.status === "rejected") {
							scoreBlurb = { kind: "na", text: t("scoreNotApplicable") };
						} else if (r.status === "approved") {
							if (latest && (latest.score != null || latest.grade)) {
								scoreBlurb = { kind: "graded", text: "" };
							} else {
								scoreBlurb = { kind: "learning", text: t("learningInProgress") };
							}
						}

						const statusLabel =
							r.status === "pending"
								? tc("pending")
								: r.status === "approved"
									? tc("approved")
									: tc("rejected");

						return (
						<li
							key={`score-${r.id}`}
							className="border-border/80 bg-card/45 rounded-2xl border p-4 shadow-[0_0_0_1px_oklch(0.55_0.14_195/0.08)]"
						>
							<div className="min-w-0 flex-1">
								<div className="flex flex-wrap items-start justify-between gap-2">
									<p className="text-sm font-semibold">{title}</p>
									<span
										className={cn(
											"shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1",
											statusBadgeClass(r.status),
										)}
									>
										{statusLabel}
									</span>
								</div>
								<div className="border-border/60 bg-background/40 mt-3 rounded-xl border px-4 py-3">
										<p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
											{t("scoreSection")}
										</p>
										{scoreBlurb.kind === "graded" && latest ? (
											<dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
												<div>
													<dt className="text-muted-foreground text-xs">{t("score")}</dt>
													<dd className="text-foreground font-medium tabular-nums">
														{latest.score != null ? String(latest.score) : "—"}
													</dd>
												</div>
												<div>
													<dt className="text-muted-foreground text-xs">{t("grade")}</dt>
													<dd className="text-foreground font-medium">
														{latest.grade ?? "—"}
													</dd>
												</div>
												{latest.certificate_url ? (
													<div className="sm:col-span-2">
														<dt className="text-muted-foreground text-xs">{t("cert")}</dt>
														<dd className="mt-0.5">
															<a
																href={latest.certificate_url}
																target="_blank"
																rel="noreferrer"
																className="text-cyan-300 text-xs break-all underline-offset-2 hover:underline"
															>
																{t("openCertificate")}
															</a>
														</dd>
													</div>
												) : null}
											</dl>
										) : (
											<p
												className={cn(
													"mt-2 text-sm font-medium",
													scoreBlurb.kind === "learning" && "text-cyan-200/90",
													scoreBlurb.kind === "pending" && "text-amber-200/85",
													scoreBlurb.kind === "na" && "text-muted-foreground",
												)}
											>
												{scoreBlurb.text}
											</p>
										)}
								</div>
							</div>
						</li>
						);
					})}
				</ul>
				) : (
					<p className="text-muted-foreground text-sm">{t("mentorScoreEmpty")}</p>
				)}
			</section>
		</div>
	);
}
