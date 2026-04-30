"use client";

import { Loader2 } from "lucide-react";
import Image from "next/image";
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
	dimensions: {
		profitability: number;
		riskControl: number;
		consistency: number;
		activeness: number;
	};
};

type TqFeatureItem = {
	featureName: string;
	rawValue: number;
	normScore: number;
	calcTime?: string;
};

type MembershipData = {
	tier: "T1" | "T2" | "T3";
	trialEndAt: string;
	trialDaysLeft: number;
	currentPeriodEnd: string | null;
	pointsBalance: number;
	redeemPlans: Array<{ planId: string; days: number; pointsCost: number }>;
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
	const locale = useLocale();

	const [rows, setRows] = useState<RegRow[] | null>(null);
	const [scoreMap, setScoreMap] = useState<Map<string, ApiScoreItem>>(() => new Map());
	const [tqEnv, setTqEnv] = useState<"sim" | "live">("sim");
	const [tq, setTq] = useState<TqScore | null>(null);
	const [tqFeatures, setTqFeatures] = useState<TqFeatureItem[]>([]);
	const [tqLoading, setTqLoading] = useState(false);
	const [membership, setMembership] = useState<MembershipData | null>(null);
	const [redeemingPlanId, setRedeemingPlanId] = useState<string>("");
	const [err, setErr] = useState<string | null>(null);

	useEffect(() => {
		let alive = true;
		async function run() {
			const [regRes, scoreRes, membershipRes] = await Promise.all([
				fetch("/api/courses/my-registrations", { credentials: "include" }),
				fetch("/api/courses/my-scores", { credentials: "include" }),
				fetch("/api/membership/me", { credentials: "include" }),
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
			const membershipJson = (await membershipRes.json()) as {
				success?: boolean;
				data?: MembershipData;
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
			if (membershipRes.ok && membershipJson.success && membershipJson.data) {
				setMembership(membershipJson.data);
			}
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
				const [scoreRes, featureRes] = await Promise.all([
					fetch(`/api/tq/score?env=${tqEnv}&period=all`, { credentials: "include" }),
					fetch(`/api/tq/features?env=${tqEnv}&period=all`, { credentials: "include" }),
				]);
				const scoreJson = (await scoreRes.json()) as {
					success?: boolean;
					data?: {
						totalScore: number;
						calcTime?: string;
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
				if (!alive) return;
				if (!scoreRes.ok || !scoreJson.success || !scoreJson.data) {
					setTq(null);
					setTqFeatures([]);
					return;
				}
				setTq({
					totalScore: scoreJson.data.totalScore ?? 0,
					calcTime: scoreJson.data.calcTime,
					dimensions: scoreJson.data.dimensions,
				});
				setTqFeatures(featureRes.ok && featureJson.success ? (featureJson.data ?? []) : []);
			} finally {
				if (alive) setTqLoading(false);
			}
		}
		void loadTq();
		return () => {
			alive = false;
		};
	}, [tqEnv]);

	async function redeemPlan(planId: string) {
		setRedeemingPlanId(planId);
		try {
			const res = await fetch("/api/membership/redeem-t3", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ planId }),
			});
			const json = (await res.json()) as {
				success?: boolean;
				data?: { membership?: MembershipData };
			};
			if (res.ok && json.success && json.data?.membership) {
				setMembership({
					...json.data.membership,
					redeemPlans: membership?.redeemPlans ?? [],
				});
			}
		} finally {
			setRedeemingPlanId("");
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

	return (
		<div className="mx-auto max-w-3xl space-y-5">
			{membership ? (
				<div className="border-border/70 bg-card/50 rounded-2xl border p-4">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<p className="text-sm font-semibold">{t("membershipTitle")}</p>
						<span className="bg-cyan-500/15 text-cyan-200 rounded-full px-2 py-0.5 text-xs font-semibold">
							{membership.tier}
						</span>
					</div>
					<p className="text-muted-foreground mt-2 text-xs">
						{membership.tier === "T1"
							? t("trialDaysLeft", { days: membership.trialDaysLeft })
							: membership.tier === "T3" && membership.currentPeriodEnd
								? t("t3ValidUntil", { date: formatSchedule(membership.currentPeriodEnd, null, locale) })
								: t("t2Benefits")}
					</p>
					<div className="mt-3 flex flex-wrap items-center justify-between gap-2">
						<p className="text-sm">
							{t("pointsBalance")}：
							<span className="ml-1 font-semibold tabular-nums">{membership.pointsBalance}</span>
						</p>
						<div className="flex flex-wrap gap-2">
							{membership.redeemPlans.map((plan) => (
								<button
									key={plan.planId}
									type="button"
									disabled={redeemingPlanId === plan.planId}
									onClick={() => void redeemPlan(plan.planId)}
									className="border-border hover:bg-muted rounded-md border px-2 py-1 text-xs"
								>
									{t("redeemPlan", { days: plan.days, points: plan.pointsCost })}
								</button>
							))}
						</div>
					</div>
				</div>
			) : null}
			<TqScoreCard
				locale={locale}
				tqEnv={tqEnv}
				onEnvChange={setTqEnv}
				loading={tqLoading}
				tq={tq}
				tqFeatures={tqFeatures}
				updateHint={t("tqUpdateCadence")}
			/>
			{!rows?.length ? (
				<p className="text-muted-foreground text-center text-sm">{t("empty")}</p>
			) : (
				<ul className="space-y-5">
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

						const modeLabel =
							c?.mode === "online"
								? tc("modeOnline")
								: c?.mode === "offline"
									? tc("modeOffline")
									: null;

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
							key={r.id}
							className="border-border/80 bg-card/45 overflow-hidden rounded-2xl border shadow-[0_0_0_1px_oklch(0.55_0.14_195/0.08)] backdrop-blur-md"
						>
							<div className="flex flex-col gap-4 p-5 sm:flex-row sm:gap-5">
								<div className="bg-muted/30 relative aspect-[16/10] w-full shrink-0 overflow-hidden rounded-xl sm:aspect-square sm:h-28 sm:w-28">
									{c?.cover_image ? (
										<Image
											src={c.cover_image}
											alt={title}
											fill
											sizes="(max-width: 640px) 100vw, 112px"
											className="object-cover"
										/>
									) : (
										<div className="text-muted-foreground/40 flex size-full items-center justify-center text-xs">
											{t("noCover")}
										</div>
									)}
								</div>
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-start justify-between gap-2">
										<div className="min-w-0">
											<h2 className="text-lg font-semibold tracking-tight">{title}</h2>
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

									<div className="border-border/60 bg-background/40 mt-4 rounded-xl border px-4 py-3">
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
							</div>
						</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
