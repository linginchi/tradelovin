"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
	getLevelByPlan,
	getLocalizedLevelDescription,
	getLocalizedLevelName,
} from "@/lib/membership/level-mapping";

type MembershipData = {
	tier: "T1" | "T2" | "T3";
	plan?: "T0_trial" | "T0_paid" | "T1" | "T2" | "T3";
	status?: string;
	trialEndAt: string;
	trialDaysLeft: number;
	currentPeriodEnd: string | null;
	pointsBalance: number;
	redeemPlans: Array<{ planId: string; days: number; pointsCost: number }>;
};

function formatDate(date: string | null, locale: string): string {
	if (!date) return "—";
	const loc = locale === "zh-TW" ? "zh-Hant" : locale === "en" ? "en" : "zh-CN";
	return new Intl.DateTimeFormat(loc, { dateStyle: "medium" }).format(new Date(date));
}

export default function MyMembershipSection() {
	const t = useTranslations("MyProfile");
	const tLevel = useTranslations("membership.level");
	const locale = useLocale();
	const [loading, setLoading] = useState(true);
	const [membership, setMembership] = useState<MembershipData | null>(null);
	const [redeemingPlanId, setRedeemingPlanId] = useState("");
	const [error, setError] = useState("");
	const [advice, setAdvice] = useState<Array<{ title: string; text: string; courseHint?: string | null }>>([]);

	useEffect(() => {
		let alive = true;
		async function run() {
			setLoading(true);
			setError("");
			try {
				const res = await fetch("/api/membership/me", { credentials: "include" });
				const json = (await res.json()) as {
					success?: boolean;
					data?: MembershipData;
					error?: string;
				};
				if (!alive) return;
				if (!res.ok || !json.success || !json.data) {
					setError(json.error ?? t("membershipLoadFailed"));
					setMembership(null);
					return;
				}
				setMembership(json.data);
				const adviceRes = await fetch("/api/tq/advice", { credentials: "include" });
				const adviceJson = (await adviceRes.json()) as {
					success?: boolean;
					data?: { advice?: Array<{ title: string; text: string; courseHint?: string | null }> };
				};
				if (adviceRes.ok && adviceJson.success) {
					setAdvice(adviceJson.data?.advice ?? []);
				}
			} catch {
				if (!alive) return;
				setError(t("membershipLoadFailed"));
				setMembership(null);
			} finally {
				if (alive) setLoading(false);
			}
		}
		void run();
		return () => {
			alive = false;
		};
	}, [t]);

	async function redeem(planId: string) {
		setRedeemingPlanId(planId);
		setError("");
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
				error?: string;
			};
			if (!res.ok || !json.success) {
				setError(json.error ?? t("membershipActionFailed"));
				return;
			}
			if (json.data?.membership) {
				setMembership(json.data.membership);
			} else {
				const refreshed = await fetch("/api/membership/me", { credentials: "include" });
				const refreshedJson = (await refreshed.json()) as { success?: boolean; data?: MembershipData };
				if (refreshed.ok && refreshedJson.success && refreshedJson.data) {
					setMembership(refreshedJson.data);
				}
			}
		} catch {
			setError(t("membershipActionFailed"));
		} finally {
			setRedeemingPlanId("");
		}
	}

	return (
		<section className="border-border/80 bg-card/30 mb-6 rounded-2xl border p-6 backdrop-blur-md md:p-8">
			<h2 className="text-base font-semibold tracking-tight">{t("membershipTitle")}</h2>
			<p className="text-muted-foreground mt-2 text-sm">{t("membershipIntro")}</p>

			{loading ? (
				<div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="size-4 animate-spin" />
					<span>{t("membershipLoading")}</span>
				</div>
			) : null}

			{!loading && membership ? (
				<div className="mt-4 space-y-3 text-sm">
					{(() => {
						const level = getLevelByPlan(membership.plan ?? membership.tier);
						return (
							<div className="rounded-lg border border-border/60 p-3">
								<p className="text-xs text-muted-foreground">{tLevel("currentLevel")}</p>
								<p className="mt-1 font-semibold">{level.code} · {getLocalizedLevelName(level, locale)}</p>
								<p className="mt-1 text-xs text-muted-foreground">{getLocalizedLevelDescription(level, locale)}</p>
							</div>
						);
					})()}
					<div className="flex flex-wrap items-center justify-between gap-2">
						<p className="font-semibold">{t("membershipTierLabel")}</p>
						<span className="bg-cyan-500/15 text-cyan-200 rounded-full px-2 py-0.5 text-xs font-semibold">
							{membership.plan ?? membership.tier}
						</span>
					</div>
					<p className="text-muted-foreground">
						{membership.tier === "T1"
							? t("trialDaysLeft", { days: membership.trialDaysLeft })
							: membership.tier === "T3" && membership.currentPeriodEnd
								? t("t3ValidUntil", { date: formatDate(membership.currentPeriodEnd, locale) })
								: t("t2Benefits")}
					</p>
					<p className="text-muted-foreground">{t("t3AccessRule")}</p>
					<div className="pt-1">
						<p>
							{t("pointsBalance")}：<span className="font-semibold tabular-nums">{membership.pointsBalance}</span>
						</p>
						<div className="mt-2 flex flex-wrap gap-2">
							<Link href="/membership" className="border-border hover:bg-muted rounded-md border px-2 py-1 text-xs">
								升级会员
							</Link>
							<Link href="/points" className="border-border hover:bg-muted rounded-md border px-2 py-1 text-xs">
								积分中心
							</Link>
							<Link href="/referral" className="border-border hover:bg-muted rounded-md border px-2 py-1 text-xs">
								邀请好友
							</Link>
							{(membership.plan === "T2" || membership.plan === "T3") && (
								<button
									type="button"
									onClick={() => window.open("/api/tq/report?format=pdf", "_blank", "noopener,noreferrer")}
									className="border-border hover:bg-muted rounded-md border px-2 py-1 text-xs"
								>
									下载 TQ 深度报告
								</button>
							)}
						</div>
						<div className="mt-2 flex flex-wrap gap-2">
							{membership.redeemPlans.map((plan) => (
								<button
									key={plan.planId}
									type="button"
									disabled={redeemingPlanId === plan.planId}
									onClick={() => void redeem(plan.planId)}
									className="border-border hover:bg-muted rounded-md border px-2 py-1 text-xs disabled:opacity-50"
								>
									{t("redeemPlan", { days: plan.days, points: plan.pointsCost })}
								</button>
							))}
						</div>
						{advice.length > 0 ? (
							<div className="mt-3 rounded-lg border border-border/60 p-3">
								<p className="mb-2 text-xs font-semibold">平台建议</p>
								<ul className="space-y-2 text-xs text-muted-foreground">
									{advice.slice(0, 3).map((item) => (
										<li key={item.title}>
											<p className="text-foreground">{item.title}</p>
											<p>{item.text}</p>
											{item.courseHint ? <p>推荐课程：{item.courseHint}</p> : null}
										</li>
									))}
								</ul>
							</div>
						) : null}
					</div>
				</div>
			) : null}

			{!loading && error ? <p className="mt-3 text-sm text-amber-300">{error}</p> : null}
		</section>
	);
}
