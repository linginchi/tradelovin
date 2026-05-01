"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

type Membership = {
  plan: "T0_trial" | "T0_paid" | "T1" | "T2" | "T3";
  status: string;
  trialDaysLeft: number;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
};

const PLAN_PRICE = {
  T1: { month: "¥29.9/月", year: "¥299/年" },
  T2: { month: "¥99/月", year: "¥999/年" },
  T3: { month: "¥299/月", year: "定制" },
} as const;

export function MembershipCenterClient() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [yearly, setYearly] = useState(false);
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

  async function subscribe(plan: "T1" | "T2" | "T3") {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/membership/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan, isYearly: yearly }),
      });
      const json = (await res.json()) as { success?: boolean; data?: { checkoutUrl?: string }; error?: string };
      if (!res.ok || !json.success || !json.data?.checkoutUrl) {
        setError(json.error ?? "发起支付失败");
        return;
      }
      window.location.assign(json.data.checkoutUrl);
    } catch {
      setError("发起支付失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelSubscription() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/membership/cancel", {
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

  const planRows = useMemo(
    () => [
      { plan: "T0", price: "14天免费后¥9.9/月", rights: "模拟交易、基础TQ、最近10笔记录" },
      { plan: "T1", price: yearly ? PLAN_PRICE.T1.year : PLAN_PRICE.T1.month, rights: "平台建议、课程9折、弱项匹配推荐" },
      { plan: "T2", price: yearly ? PLAN_PRICE.T2.year : PLAN_PRICE.T2.month, rights: "深度TQ报告PDF、改善建议、证书" },
      { plan: "T3", price: yearly ? PLAN_PRICE.T3.year : PLAN_PRICE.T3.month, rights: "策略模板、1v1复盘、历史数据导出" },
    ],
    [yearly],
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
            onClick={() => setYearly((v) => !v)}
          >
            {yearly ? "切换月付" : "切换年付（约85折）"}
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {planRows.map((row) => (
            <div key={row.plan} className="rounded-xl border border-border/70 p-3">
              <p className="font-semibold">{row.plan}</p>
              <p className="text-sm text-muted-foreground">{row.price}</p>
              <p className="mt-1 text-sm">{row.rights}</p>
              {row.plan !== "T0" ? (
                <Button
                  className="mt-3"
                  disabled={submitting}
                  onClick={() => void subscribe(row.plan as "T1" | "T2" | "T3")}
                >
                  {submitting ? "处理中..." : `升级 ${row.plan}`}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card/35 p-6">
        <h2 className="text-lg font-semibold">订阅管理</h2>
        <p className="mt-2 text-sm text-muted-foreground">取消后将在当前计费周期结束时自动降级。</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" disabled={submitting} onClick={() => void cancelSubscription()}>
            取消订阅
          </Button>
          <Button asChild variant="secondary">
            <Link href="/points">积分中心</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/referral">邀请好友</Link>
          </Button>
        </div>
      </section>

      {error ? <p className="text-sm text-amber-300">{error}</p> : null}
    </main>
  );
}
