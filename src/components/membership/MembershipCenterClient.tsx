"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

type Membership = {
  plan: "T0_trial" | "T0_paid" | "T1" | "T2" | "T3";
  status: string;
  trialDaysLeft: number;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
};

type PaidPlan = "T1" | "T2" | "T3";

const PLAN_PRICE = {
  T1: { monthly: "HK$49 / ¥49", yearly: "HK$499 / ¥499" },
  T2: { monthly: "HK$99 / ¥99", yearly: "HK$999 / ¥999" },
  T3: { monthly: "HK$299 / ¥299", yearly: "HK$2999 / ¥2999" },
} as const;

export function MembershipCenterClient() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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
    setSubmitting(true);
    setError("");
    try {
      if (
        process.env.NODE_ENV === "production" &&
        typeof window !== "undefined" &&
        window.location.protocol !== "https:"
      ) {
        throw new Error("仅允许 HTTPS 请求，请确认当前站点使用 https 打开。");
      }

      const publishableKey =
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY;
      if (!publishableKey) {
        console.warn(
          "[membership] Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY / NEXT_PUBLIC_STRIPE_PUBLIC_KEY. Stripe checkout may fail.",
        );
      }

      const res = await fetch("/api/membership/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan, period }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        sessionUrl?: string;
        error?: string;
      };
      if (!res.ok || !json.success || !json.sessionUrl) {
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
        err instanceof Error
          ? err.message
          : "发起支付失败，请稍后重试。";
      console.error("[membership] subscribe exception", { plan, period, err });
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelSubscription() {
    setSubmitting(true);
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
      setSubmitting(false);
    }
  }

  async function resumeSubscription() {
    setSubmitting(true);
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
      setSubmitting(false);
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
            <div className="rounded-xl border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">当前计划</p>
              <p className="text-xl font-semibold">{membership.plan}</p>
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
              <p className="font-semibold">{row.plan}</p>
              <p className="text-sm text-muted-foreground">{row.price}</p>
              <p className="mt-1 text-sm">{row.rights}</p>
              <Button className="mt-3" disabled={submitting} onClick={() => void subscribe(row.plan)}>
                {submitting ? "处理中..." : `立即支付 ${row.plan}`}
              </Button>
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
        <h2 className="text-lg font-semibold">订阅管理</h2>
        <p className="mt-2 text-sm text-muted-foreground">取消后将在当前计费周期结束时自动降级。</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" disabled={submitting} onClick={() => void cancelSubscription()}>
            取消订阅
          </Button>
          <Button variant="outline" disabled={submitting} onClick={() => void resumeSubscription()}>
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
