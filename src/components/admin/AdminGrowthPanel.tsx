"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type MembershipRow = {
  id: string;
  user_id: string;
  plan: string;
  status: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
};

type PointRow = {
  user_id: string;
  balance: number;
  total_earned: number;
  total_spent: number;
  updated_at: string;
};

type PaymentRow = {
  id: string;
  user_id: string | null;
  amount: number;
  currency: string;
  status: string;
  transaction_id: string;
  created_at: string;
};

type ReferralSummary = {
  total: number;
  completedPayment: number;
  rewarded: number;
  conversionRate: number;
  rows: Array<{
    id: string;
    referrer_id: string;
    referee_id: string | null;
    status: string;
    reward_granted: boolean;
  }>;
};

export function AdminGrowthPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [points, setPoints] = useState<PointRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [referrals, setReferrals] = useState<ReferralSummary | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ userId: "", delta: "", reason: "" });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [mRes, pRes, payRes, rRes] = await Promise.all([
        fetch("/api/admin/membership/list", { credentials: "include" }),
        fetch("/api/admin/points/users", { credentials: "include" }),
        fetch("/api/admin/payments/list", { credentials: "include" }),
        fetch("/api/admin/referrals/stats", { credentials: "include" }),
      ]);
      const [mJson, pJson, payJson, rJson] = await Promise.all([
        mRes.json(),
        pRes.json(),
        payRes.json(),
        rRes.json(),
      ]);
      if (!mRes.ok || !pRes.ok || !payRes.ok || !rRes.ok) {
        setError("后台数据加载失败");
        return;
      }
      setMemberships((mJson.data ?? []) as MembershipRow[]);
      setPoints((pJson.data ?? []) as PointRow[]);
      setPayments((payJson.data ?? []) as PaymentRow[]);
      setReferrals((rJson.data ?? null) as ReferralSummary | null);
    } catch {
      setError("后台数据加载失败");
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

  async function submitAdjust() {
    setAdjusting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/points/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          userId: adjustForm.userId.trim(),
          delta: Number(adjustForm.delta),
          reason: adjustForm.reason.trim(),
        }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        setError(json.error ?? "调整失败");
        return;
      }
      setAdjustForm({ userId: "", delta: "", reason: "" });
      await load();
    } catch {
      setError("调整失败");
    } finally {
      setAdjusting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border/70 bg-card/35 p-4">
        <h2 className="text-lg font-semibold">推荐统计</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-xs text-muted-foreground">总推荐</p>
            <p className="text-xl font-semibold">{referrals?.total ?? 0}</p>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-xs text-muted-foreground">已付费转化</p>
            <p className="text-xl font-semibold">{referrals?.completedPayment ?? 0}</p>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-xs text-muted-foreground">已发奖励</p>
            <p className="text-xl font-semibold">{referrals?.rewarded ?? 0}</p>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-xs text-muted-foreground">转化率</p>
            <p className="text-xl font-semibold">{referrals?.conversionRate ?? 0}%</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border/70 bg-card/35 p-4">
        <h2 className="text-lg font-semibold">会员管理</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="py-2">用户ID</th>
                <th className="py-2">计划</th>
                <th className="py-2">状态</th>
                <th className="py-2">到期时间</th>
                <th className="py-2">周期末取消</th>
              </tr>
            </thead>
            <tbody>
              {memberships.slice(0, 100).map((row) => (
                <tr key={row.id} className="border-b border-border/40">
                  <td className="py-2 font-mono text-xs">{row.user_id}</td>
                  <td className="py-2">{row.plan}</td>
                  <td className="py-2">{row.status}</td>
                  <td className="py-2">{new Date(row.current_period_end).toLocaleString()}</td>
                  <td className="py-2">{row.cancel_at_period_end ? "是" : "否"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-border/70 bg-card/35 p-4">
        <h2 className="text-lg font-semibold">积分调整</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="用户ID"
            value={adjustForm.userId}
            onChange={(e) => setAdjustForm((v) => ({ ...v, userId: e.target.value }))}
          />
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="调整值（正负）"
            value={adjustForm.delta}
            onChange={(e) => setAdjustForm((v) => ({ ...v, delta: e.target.value }))}
          />
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="原因"
            value={adjustForm.reason}
            onChange={(e) => setAdjustForm((v) => ({ ...v, reason: e.target.value }))}
          />
          <Button disabled={adjusting} onClick={() => void submitAdjust()}>
            {adjusting ? "提交中..." : "提交调整"}
          </Button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="py-2">用户ID</th>
                <th className="py-2">余额</th>
                <th className="py-2">累计获得</th>
                <th className="py-2">累计消耗</th>
              </tr>
            </thead>
            <tbody>
              {points.slice(0, 100).map((row) => (
                <tr key={row.user_id} className="border-b border-border/40">
                  <td className="py-2 font-mono text-xs">{row.user_id}</td>
                  <td className="py-2">{row.balance}</td>
                  <td className="py-2">{row.total_earned}</td>
                  <td className="py-2">{row.total_spent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-border/70 bg-card/35 p-4">
        <h2 className="text-lg font-semibold">支付记录</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="py-2">交易ID</th>
                <th className="py-2">用户ID</th>
                <th className="py-2">金额</th>
                <th className="py-2">状态</th>
                <th className="py-2">时间</th>
              </tr>
            </thead>
            <tbody>
              {payments.slice(0, 100).map((row) => (
                <tr key={row.id} className="border-b border-border/40">
                  <td className="py-2 font-mono text-xs">{row.transaction_id}</td>
                  <td className="py-2 font-mono text-xs">{row.user_id ?? "-"}</td>
                  <td className="py-2">
                    {row.amount} {row.currency}
                  </td>
                  <td className="py-2">{row.status}</td>
                  <td className="py-2">{new Date(row.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {loading ? <p className="text-sm text-muted-foreground">加载中...</p> : null}
      {error ? <p className="text-sm text-amber-300">{error}</p> : null}
    </div>
  );
}
