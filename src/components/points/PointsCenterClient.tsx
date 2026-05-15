"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

type SummaryResponse = {
  points: {
    balance: number;
    totalEarned: number;
    totalSpent: number;
    updatedAt: string;
  };
  transactions: Array<{
    id: string;
    amount: number;
    type: "earn" | "spend";
    reason: string | null;
    created_at: string;
  }>;
  redemptions: Array<{
    id: string;
    reward_type: string;
    code: string;
    status: string;
    created_at: string;
  }>;
};

const REWARDS = [
  { rewardType: "membership_discount", label: "7天 P1 · 雪豹体验券", points: 200 },
  { rewardType: "course_voucher", label: "课程 9 折券", points: 300 },
  { rewardType: "t2_report_single_download", label: "P2 · 云豹报告单次下载券", points: 150 },
] as const;

export function PointsCenterClient() {
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string>("");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<SummaryResponse | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/points/balance", { credentials: "include" });
      const json = (await res.json()) as { success?: boolean; data?: SummaryResponse; error?: string };
      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? "积分数据加载失败");
        setSummary(null);
      } else {
        setSummary(json.data);
      }
    } catch {
      setError("积分数据加载失败");
      setSummary(null);
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

  async function redeem(rewardType: string) {
    setRedeeming(rewardType);
    setError("");
    try {
      const res = await fetch("/api/points/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rewardType }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        setError(json.error ?? "兑换失败");
      } else {
        await load();
      }
    } catch {
      setError("兑换失败");
    } finally {
      setRedeeming("");
    }
  }

  const recentTransactions = useMemo(() => summary?.transactions?.slice(0, 20) ?? [], [summary]);
  const recentRedemptions = useMemo(() => summary?.redemptions?.slice(0, 20) ?? [], [summary]);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <section className="rounded-2xl border border-border/70 bg-card/35 p-6">
        <h1 className="text-2xl font-semibold">积分中心</h1>
        <p className="mt-2 text-sm text-muted-foreground">查看积分余额、流水并兑换平台权益。</p>

        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            加载中...
          </div>
        ) : null}

        {!loading && summary ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">当前余额</p>
              <p className="text-xl font-semibold tabular-nums">{summary.points.balance}</p>
            </div>
            <div className="rounded-xl border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">累计获得</p>
              <p className="text-xl font-semibold tabular-nums">{summary.points.totalEarned}</p>
            </div>
            <div className="rounded-xl border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">累计消耗</p>
              <p className="text-xl font-semibold tabular-nums">{summary.points.totalSpent}</p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border/70 bg-card/35 p-6">
        <h2 className="text-lg font-semibold">兑换商城</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {REWARDS.map((reward) => (
            <div key={reward.rewardType} className="rounded-xl border border-border/70 p-3">
              <p className="font-medium">{reward.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{reward.points} 积分</p>
              <Button
                className="mt-3 w-full"
                onClick={() => void redeem(reward.rewardType)}
                disabled={Boolean(redeeming)}
              >
                {redeeming === reward.rewardType ? "兑换中..." : "立即兑换"}
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card/35 p-6">
        <h2 className="text-lg font-semibold">积分流水</h2>
        <div className="mt-3 space-y-2 text-sm">
          {recentTransactions.length === 0 ? (
            <p className="text-muted-foreground">暂无记录</p>
          ) : (
            recentTransactions.map((row) => (
              <div key={row.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                <span>{row.reason ?? "unknown"}</span>
                <span className={row.type === "earn" ? "text-emerald-400" : "text-amber-300"}>
                  {row.type === "earn" ? "+" : ""}
                  {row.amount}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card/35 p-6">
        <h2 className="text-lg font-semibold">兑换记录</h2>
        <div className="mt-3 space-y-2 text-sm">
          {recentRedemptions.length === 0 ? (
            <p className="text-muted-foreground">暂无记录</p>
          ) : (
            recentRedemptions.map((row) => (
              <div key={row.id} className="rounded-lg border border-border/60 px-3 py-2">
                <p>{row.reward_type}</p>
                <p className="font-mono text-xs text-muted-foreground">{row.code}</p>
              </div>
            ))
          )}
        </div>
      </section>

      <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm font-semibold text-amber-100">
        积分仅限本平台使用，不可兑换现金，不可转让，最终解释权归豹仔乐园所有。
      </p>

      {error ? <p className="text-sm text-amber-300">{error}</p> : null}
    </main>
  );
}
