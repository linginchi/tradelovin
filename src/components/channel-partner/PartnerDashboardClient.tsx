"use client";

import { Copy, Loader2, Share2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type PartnerData = {
  partner: {
    id: string;
    channelName: string;
    channelType: string;
    platform: string | null;
    commissionRate: number;
    status: string;
    payoutInfo: Record<string, unknown> | null;
  };
  stats: {
    monthEstimate: number;
    totalEarned: number;
    totalPaid: number;
    pendingAmount: number;
  };
};

type ReferralRow = {
  id: string;
  code: string;
  studentName: string;
  status: string;
  tuitionAmount: number;
  commissionAmount: number;
  commissionStatus: string | null;
  createdAt: string;
  completedAt: string | null;
};

export function PartnerDashboardClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<PartnerData | null>(null);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [inviteLink, setInviteLink] = useState("");
  const [tab, setTab] = useState<"referrals" | "payouts">("referrals");
  const [payouts, setPayouts] = useState<Array<Record<string, unknown>>>([]);

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [profileRes, referralRes, commissionRes] = await Promise.all([
        fetch("/api/channel-partner/my-profile", { credentials: "include" }),
        fetch("/api/channel-partner/my-referrals", { credentials: "include" }),
        fetch("/api/channel-partner/my-commissions", { credentials: "include" }),
      ]);

      const profileJson: { success?: boolean; data?: PartnerData; error?: string } =
        await profileRes.json();
      if (!profileRes.ok || !profileJson.success) {
        setError(profileJson.error ?? "加载失败");
        return;
      }
      setData(profileJson.data!);
      setInviteLink(
        `${window.location.origin}/register?ref=${profileJson.data!.partner.id}`,
      );

      const referralJson: { success?: boolean; data?: { rows: ReferralRow[] } } =
        await referralRes.json();
      if (referralJson.success) setReferrals(referralJson.data?.rows ?? []);

      const commissionJson: { success?: boolean; data?: { payouts: Array<Record<string, unknown>> } } =
        await commissionRes.json();
      if (commissionJson.success) setPayouts(commissionJson.data?.payouts ?? []);
    } catch {
      setError("加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function copyLink() {
    await navigator.clipboard.writeText(inviteLink);
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 加载中...
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-amber-300">{error ?? "数据加载失败"}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      {/* 顶部：KOL 信息 */}
      <section className="rounded-2xl border border-border/70 bg-card/35 p-6">
        <h1 className="text-2xl font-semibold">
          {data.partner.channelName} 推广看板
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          分佣比例：{Number(data.partner.commissionRate) * 100}%
          &nbsp;|&nbsp; 状态：
          {data.partner.status === "active" ? "正常" : "暂停"}
        </p>
      </section>

      {/* 推广链接 */}
      <section className="rounded-2xl border border-border/70 bg-card/35 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Share2 className="size-4" /> 我的推广链接
        </h2>
        <div className="mt-3 rounded-xl border border-border/70 bg-background p-3">
          <p className="break-all text-sm">{inviteLink}</p>
        </div>
        <div className="mt-3 flex gap-2">
          <Button onClick={() => void copyLink()}>
            <Copy className="mr-2 size-4" /> 复制链接
          </Button>
        </div>
      </section>

      {/* 数据概览 */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          {
            label: "本月预估",
            value: `¥${data.stats.monthEstimate.toLocaleString()}`,
            color: "text-emerald-400",
          },
          {
            label: "累计已结算",
            value: `¥${data.stats.totalPaid.toLocaleString()}`,
            color: "text-cyan-400",
          },
          {
            label: "累计应得",
            value: `¥${data.stats.totalEarned.toLocaleString()}`,
            color: "",
          },
          {
            label: "待审核",
            value: `¥${data.stats.pendingAmount.toLocaleString()}`,
            color: "text-amber-300",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-border/60 bg-card/30 p-4"
          >
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className={`mt-1 text-xl font-semibold ${card.color}`}>
              {card.value}
            </p>
          </div>
        ))}
      </section>

      {/* 引入学员 / 结算记录 Tabs */}
      <section className="rounded-2xl border border-border/70 bg-card/35 p-6">
        <div className="flex gap-4 border-b border-border/60 pb-3">
          <button
            type="button"
            className={`text-sm font-medium ${
              tab === "referrals" ? "text-cyan-300" : "text-muted-foreground"
            }`}
            onClick={() => setTab("referrals")}
          >
            引入学员 ({referrals.length})
          </button>
          <button
            type="button"
            className={`text-sm font-medium ${
              tab === "payouts" ? "text-cyan-300" : "text-muted-foreground"
            }`}
            onClick={() => setTab("payouts")}
          >
            结算记录 ({payouts.length})
          </button>
        </div>

        {tab === "referrals" && (
          <div className="mt-3 space-y-2">
            {referrals.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                暂无引入学员
              </p>
            ) : (
              referrals.map((r) => (
                <div
                  key={r.id}
                  className="rounded-lg border border-border/60 px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{r.studentName}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      学费: ¥{Number(r.tuitionAmount).toLocaleString()}
                    </span>
                    <span className="text-emerald-400">
                      佣金: +¥{Number(r.commissionAmount).toLocaleString()}
                    </span>
                    <span>
                      状态:{" "}
                      {r.commissionStatus === "paid"
                        ? "已结算"
                        : r.commissionStatus === "locked"
                          ? "已锁定"
                          : r.commissionStatus === "pending"
                            ? "待确认"
                            : "—"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "payouts" && (
          <div className="mt-3 space-y-2">
            {payouts.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                暂无结算记录
              </p>
            ) : (
              payouts.map((p) => (
                <div
                  key={String(p.id)}
                  className="rounded-lg border border-border/60 px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {String(p.settlement_month ?? "")}
                    </span>
                    <span className="font-medium text-emerald-400">
                      ¥{Number(p.total_commission).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    状态:{" "}
                    {p.status === "paid"
                      ? "已打款"
                      : p.status === "approved"
                        ? "已审核"
                        : p.status === "pending"
                          ? "待审核"
                          : "已取消"}
                    {p.paid_at
                      ? ` · ${new Date(String(p.paid_at)).toLocaleDateString()} 到账`
                      : ""}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      {error ? <p className="text-sm text-amber-300">{error}</p> : null}
    </main>
  );
}
