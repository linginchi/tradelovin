"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type SummaryData = {
  code: string;
  inviteLink: string;
  referrals: Array<{
    id: string;
    status: string;
    reward_granted: boolean;
    created_at: string;
    completed_at: string | null;
  }>;
  rewards: Array<{
    id: string;
    amount: number;
    reason: string;
    created_at: string;
  }>;
};

export function ReferralCenterClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<SummaryData | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/referral/summary", { credentials: "include" });
      const json = (await res.json()) as { success?: boolean; data?: SummaryData; error?: string };
      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? "加载失败");
        setData(null);
      } else {
        setData(json.data);
      }
    } catch {
      setError("加载失败");
      setData(null);
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

  async function copyLink() {
    if (!data?.inviteLink) return;
    await navigator.clipboard.writeText(data.inviteLink);
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <section className="rounded-2xl border border-border/70 bg-card/35 p-6">
        <h1 className="text-2xl font-semibold">邀请好友</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          分享邀请码，好友注册与首次付费后可获得会期和积分奖励。
        </p>
        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            加载中...
          </div>
        ) : null}
        {!loading && data ? (
          <div className="mt-4 rounded-xl border border-border/70 p-3">
            <p className="text-xs text-muted-foreground">邀请码</p>
            <p className="font-mono text-lg">{data.code}</p>
            <p className="mt-2 break-all text-sm">{data.inviteLink}</p>
            <Button className="mt-3" onClick={() => void copyLink()}>
              复制邀请链接
            </Button>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border/70 bg-card/35 p-6">
        <h2 className="text-lg font-semibold">邀请记录</h2>
        <div className="mt-3 space-y-2 text-sm">
          {(data?.referrals ?? []).length === 0 ? (
            <p className="text-muted-foreground">暂无邀请记录</p>
          ) : (
            data?.referrals.map((item) => (
              <div key={item.id} className="rounded-lg border border-border/60 px-3 py-2">
                <p>状态：{item.status}</p>
                <p className="text-xs text-muted-foreground">奖励发放：{item.reward_granted ? "是" : "否"}</p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card/35 p-6">
        <h2 className="text-lg font-semibold">奖励记录</h2>
        <div className="mt-3 space-y-2 text-sm">
          {(data?.rewards ?? []).length === 0 ? (
            <p className="text-muted-foreground">暂无奖励</p>
          ) : (
            data?.rewards.map((item) => (
              <div key={item.id} className="rounded-lg border border-border/60 px-3 py-2">
                <p>{item.reason}</p>
                <p className="text-emerald-400">+{item.amount}</p>
              </div>
            ))
          )}
        </div>
      </section>

      {error ? <p className="text-sm text-amber-300">{error}</p> : null}
    </main>
  );
}
