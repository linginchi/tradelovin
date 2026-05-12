"use client";

import { useEffect, useState } from "react";

type Membership = {
  plan: string;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
};

type Transaction = {
  id: string;
  gateway: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
};

type ManualOrder = {
  id: string;
  order_no: string;
  plan: string;
  period: string;
  amount: number;
  status: string;
  admin_notes: string | null;
  created_at: string;
};

export function MyMembershipClient() {
  const [membership, setMembership] = useState<Membership | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [orders, setOrders] = useState<ManualOrder[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [mRes, tRes, oRes] = await Promise.all([
          fetch("/api/membership/current", { credentials: "include" }),
          fetch("/api/membership/transactions", { credentials: "include" }),
          fetch("/api/membership/fps/orders", { credentials: "include" }),
        ]);
        const mJson = (await mRes.json()) as { success?: boolean; data?: Membership };
        const tJson = (await tRes.json()) as { success?: boolean; data?: Transaction[] };
        const oJson = (await oRes.json()) as { success?: boolean; data?: ManualOrder[] };
        if (!mRes.ok || !tRes.ok || !oRes.ok) {
          setError("加载会员信息失败");
          return;
        }
        setMembership(mJson.data ?? null);
        setTransactions(tJson.data ?? []);
        setOrders(oJson.data ?? []);
      } catch {
        setError("加载会员信息失败");
      }
    })();
  }, []);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <section className="rounded-2xl border border-border/70 bg-card/35 p-6">
        <h1 className="text-2xl font-semibold">我的会员</h1>
        {membership ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">当前会员等级</p>
              <p className="text-lg font-semibold">{membership.plan}</p>
            </div>
            <div className="rounded-xl border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">到期时间</p>
              <p className="text-sm font-semibold">{new Date(membership.currentPeriodEnd).toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">状态</p>
              <p className="text-lg font-semibold">{membership.status}</p>
            </div>
            <div className="rounded-xl border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">自动续费</p>
              <p className="text-lg font-semibold">{membership.cancelAtPeriodEnd ? "已取消" : "开启中"}</p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border/70 bg-card/35 p-6">
        <h2 className="text-lg font-semibold">支付流水</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="py-2">渠道</th>
                <th className="py-2">金额</th>
                <th className="py-2">状态</th>
                <th className="py-2">时间</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((row) => (
                <tr key={row.id} className="border-b border-border/40">
                  <td className="py-2">{row.gateway}</td>
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

      <section className="rounded-2xl border border-border/70 bg-card/35 p-6">
        <h2 className="text-lg font-semibold">FPS 手动订单</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="py-2">订单号</th>
                <th className="py-2">套餐</th>
                <th className="py-2">金额</th>
                <th className="py-2">状态</th>
                <th className="py-2">备注</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((row) => (
                <tr key={row.id} className="border-b border-border/40">
                  <td className="py-2 font-mono text-xs">{row.order_no}</td>
                  <td className="py-2">
                    {row.plan} / {row.period}
                  </td>
                  <td className="py-2">{row.amount}</td>
                  <td className="py-2">{row.status}</td>
                  <td className="py-2">{row.admin_notes ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {error ? <p className="text-sm text-amber-300">{error}</p> : null}
    </main>
  );
}
