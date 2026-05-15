"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import {
  getDisplayLevel,
  getLocalizedLevelDescription,
  getLocalizedLevelLabel,
} from "@/lib/membership/level-mapping";

type Membership = {
  plan: "T0_trial" | "T0_paid" | "T1" | "T2" | "T3";
  status: string;
  trialDaysLeft: number;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  upgradePreview?: {
    membershipPlan: Membership["plan"];
    currentPaidPlan: PaidPlan | null;
    nextPlan: PaidPlan | null;
    monthlyScore: number;
    monthlyTradeCount: number;
    minTradesForScore: number;
    allowedPlans: PaidPlan[];
    planRequirements: Record<PaidPlan, { requiredScore: number; missingScore: number; unlocked: boolean }>;
  } | null;
};

type PaidPlan = "T1" | "T2" | "T3";

const PLAN_PRICE = {
  T1: { monthly: "HK$49 / ¥49", yearly: "HK$499 / ¥499" },
  T2: { monthly: "HK$99 / ¥99", yearly: "HK$999 / ¥999" },
  T3: { monthly: "HK$299 / ¥299", yearly: "HK$2999 / ¥2999" },
} as const;

export function MembershipCenterClient() {
  const locale = useLocale();
  const t = useTranslations("membership.level");
  const [loading, setLoading] = useState(true);
  const [submittingPlan, setSubmittingPlan] = useState<PaidPlan | null>(null);
  const [managingBilling, setManagingBilling] = useState(false);
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const [error, setError] = useState("");
  const [membership, setMembership] = useState<Membership | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/membership/current", { credentials: "include" });
      const json = (await res.json()) as { success?: boolean; data?: Membership; error?: string };
      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? "会员信息加载失败");
        setMembership(null);
      } else {
        setMembership(json.data);
      }
    } catch {
      setError("会员信息加载失败");
      setMembership(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function subscribe(plan: PaidPlan) {
    setSubmittingPlan(plan);
    setError("");
    try {
      const publishableKey =
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY;
      if (!publishableKey) {
        console.warn(
          "[membership] Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY / NEXT_PUBLIC_STRIPE_PUBLIC_KEY. Stripe checkout may fail.",
        );
      }

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 15000);
      const res = await fetch("/api/membership/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan, period }),
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);
      const json = (await res.json()) as {
        success?: boolean;
        sessionUrl?: string;
        freeUpgrade?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success || !json.sessionUrl) {
        if (res.ok && json.success && json.freeUpgrade) {
          await load();
          setError(json.message ?? "已免费升级成功。");
          return;
        }
        const message = json.error ?? "发起支付失败，请稍后重试。";
        console.error("[membership] create-checkout failed", {
          status: res.status,
          plan,
          period,
          response: json,
        });
        setError(message);
        return;
      }
      window.location.assign(json.sessionUrl);
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "AbortError"
          ? "请求超时，请重试。"
          : err instanceof Error
            ? err.message
            : "发起支付失败，请稍后重试。";
      console.error("[membership] subscribe exception", { plan, period, err });
      setError(message);
    } finally {
      setSubmittingPlan(null);
    }
  }

  async function cancelSubscription() {
    setManagingBilling(true);
    setError("");
    try {
      const res = await fetch("/api/membership/cancel-subscription", {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        setError(json.error ?? "取消失败");
        return;
      }
      await load();
    } catch {
      setError("取消失败");
    } finally {
      setManagingBilling(false);
    }
  }

  async function resumeSubscription() {
    setManagingBilling(true);
    setError("");
    try {
      const res = await fetch("/api/membership/resume-subscription", {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        setError(json.error ?? "恢复失败");
        return;
      }
      await load();
    } catch {
      setError("恢复失败");
    } finally {
      setManagingBilling(false);
    }
  }

  const planRows = useMemo(
    (): Array<{ plan: PaidPlan; price: string; rights: string }> => [
      { plan: "T1", price: PLAN_PRICE.T1[period], rights: "模拟交易、课程折扣、训练建议" },
      { plan: "T2", price: PLAN_PRICE.T2[period], rights: "深度 TQ 报告、证书、改善建议" },
      { plan: "T3", price: PLAN_PRICE.T3[period], rights: "T2 全部 + L2 行情 + 高级策略能力" },
    ],
    [period],
  );

  const upgradePreview = membership?.upgradePreview ?? null;
  const allowedPlans = new Set(upgradePreview?.allowedPlans ?? []);

  function getPlanDisabledReason(plan: PaidPlan): string {
    if (!upgradePreview) return "";
    if (upgradePreview.nextPlan !== plan) {
      if (!upgradePreview.nextPlan) return "已达到最高等级";
      return `当前仅可升级到 ${upgradePreview.nextPlan}`;
    }
    const req = upgradePreview.planRequirements[plan];
    if (upgradePreview.monthlyTradeCount < upgradePreview.minTradesForScore) {
      return `本月交易笔数不足（${upgradePreview.monthlyTradeCount}/${upgradePreview.minTradesForScore}）`;
    }
    if (!req.unlocked) {
      return `TQ月度分不足，距离门槛还差 ${req.missingScore} 分`;
    }
    return "";
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <section className="rounded-2xl border border-border/70 bg-card/35 p-6">
        <h1 className="text-2xl font-semibold">会员中心</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          14天试用结束后，需升级会员继续使用模拟交易和 TQ 评分。
        </p>
        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            加载中...
          </div>
        ) : null}
        {!loading && membership ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(() => {
              const level = getDisplayLevel(membership.plan);
              return (
                <div className="rounded-xl border border-border/70 p-3 sm:col-span-2">
                  <p className="text-xs text-muted-foreground">{t("currentLevel")}</p>
                  <p className="text-xl font-semibold">{getLocalizedLevelLabel(level, locale)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{getLocalizedLevelDescription(level, locale)}</p>
                </div>
              );
            })()}
            <div className="rounded-xl border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">当前计划</p>
              <p className="text-xl font-semibold">
                {getLocalizedLevelLabel(getDisplayLevel(membership.plan), locale)}
              </p>
            </div>
            <div className="rounded-xl border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">状态</p>
              <p className="text-xl font-semibold">{membership.status}</p>
            </div>
            <div className="rounded-xl border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">试用剩余天数</p>
              <p className="text-xl font-semibold tabular-nums">{membership.trialDaysLeft}</p>
            </div>
            <div className="rounded-xl border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">到期时间</p>
              <p className="text-sm font-semibold">{new Date(membership.currentPeriodEnd).toLocaleString()}</p>
            </div>
            {upgradePreview ? (
              <div className="rounded-xl border border-border/70 p-3 sm:col-span-2">
                <p className="text-xs text-muted-foreground">升级进度（模拟盘月度 TQ）</p>
                <p className="text-sm">
                  当前分数 <span className="font-semibold">{upgradePreview.monthlyScore.toFixed(2)}</span>
                  ，交易笔数{" "}
                  <span className="font-semibold">
                    {upgradePreview.monthlyTradeCount}/{upgradePreview.minTradesForScore}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {upgradePreview.nextPlan
                    ? `下一档 ${upgradePreview.nextPlan} 门槛：${upgradePreview.planRequirements[upgradePreview.nextPlan].requiredScore}`
                    : "已到最高档位"}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border/70 bg-card/35 p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">套餐与权益</h2>
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1 text-sm"
            onClick={() => setPeriod((v) => (v === "monthly" ? "yearly" : "monthly"))}
          >
            {period === "yearly" ? "切换月付" : "切换年付"}
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {planRows.map((row) => (
            <div key={row.plan} className="rounded-xl border border-border/70 p-3">
              {(() => {
                const level = getDisplayLevel(row.plan);
                return (
                  <>
                    <p className="font-semibold">{getLocalizedLevelLabel(level, locale)}</p>
                    <p className="text-xs text-muted-foreground">{getLocalizedLevelDescription(level, locale)}</p>
                  </>
                );
              })()}
              <p className="text-sm text-muted-foreground">{row.price}</p>
              <p className="mt-1 text-sm">{row.rights}</p>
              <Button
                className="mt-3"
                disabled={Boolean(submittingPlan) || managingBilling || (Boolean(upgradePreview) && !allowedPlans.has(row.plan))}
                onClick={() => void subscribe(row.plan)}
              >
                {submittingPlan === row.plan
                  ? "处理中..."
                  : `立即支付 ${getLocalizedLevelLabel(getDisplayLevel(row.plan), locale)}`}
              </Button>
              {upgradePreview && !allowedPlans.has(row.plan) ? (
                <p className="mt-2 text-xs text-muted-foreground">{getPlanDisabledReason(row.plan)}</p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card/35 p-6">
        <h2 className="text-lg font-semibold">支付方式</h2>
        <div className="mt-3">
          <Button disabled>在线支付（Stripe）</Button>
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card/35 p-6">
        <h2 className="text-lg font-semibold">续费管理</h2>
        <p className="mt-2 text-sm text-muted-foreground">取消续费后将在当前计费周期结束时自动降级。</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" disabled={managingBilling || Boolean(submittingPlan)} onClick={() => void cancelSubscription()}>
            取消续费
          </Button>
          <Button variant="outline" disabled={managingBilling || Boolean(submittingPlan)} onClick={() => void resumeSubscription()}>
            恢复续费
          </Button>
          <Link href="/points" className={buttonVariants({ variant: "secondary" })}>
            积分中心
          </Link>
          <Link href="/referral" className={buttonVariants({ variant: "secondary" })}>
            邀请好友
          </Link>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-amber-300/35 bg-amber-500/10 p-3 text-sm text-amber-200">
          <p>{error}</p>
        </div>
      ) : null}
    </main>
  );
}
