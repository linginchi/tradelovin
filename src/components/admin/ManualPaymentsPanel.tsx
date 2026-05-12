"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type ManualPaymentOrder = {
  id: string;
  order_no: string;
  user_id: string;
  plan: string;
  period: string;
  amount: number;
  status: string;
  proof_image_url: string | null;
  admin_notes: string | null;
  created_at: string;
};

export function ManualPaymentsPanel() {
  const [rows, setRows] = useState<ManualPaymentOrder[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = status ? `?status=${encodeURIComponent(status)}` : "";
      const res = await fetch(`/api/admin/manual-payments${query}`, { credentials: "include" });
      const json = (await res.json()) as { success?: boolean; data?: ManualPaymentOrder[]; error?: string };
      if (!res.ok || !json.success) {
        setError(json.error ?? "加载失败");
        return;
      }
      setRows(json.data ?? []);
    } catch {
      setError("加载失败");
    } finally {
      setLoading(false);
    }
  }, [status]);

  async function approve(id: string) {
    const res = await fetch(`/api/admin/manual-payments/${id}/approve`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      setError("审核通过失败");
      return;
    }
    await load();
  }

  async function reject(id: string) {
    const reason = window.prompt("请输入驳回原因");
    if (!reason) return;
    const res = await fetch(`/api/admin/manual-payments/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) {
      setError("驳回失败");
      return;
    }
    await load();
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <main className="space-y-4">
      <section className="rounded-xl border border-border/70 bg-card/35 p-4">
        <h2 className="text-lg font-semibold">手动支付审核</h2>
        <div className="mt-3 flex gap-2">
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">全部状态</option>
            <option value="pending">pending</option>
            <option value="pending_approval">pending_approval</option>
            <option value="paid">paid</option>
            <option value="cancelled">cancelled</option>
            <option value="expired">expired</option>
          </select>
          <Button variant="outline" onClick={() => void load()}>
            刷新
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-border/70 bg-card/35 p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="py-2">订单号</th>
                <th className="py-2">用户</th>
                <th className="py-2">套餐</th>
                <th className="py-2">金额</th>
                <th className="py-2">状态</th>
                <th className="py-2">凭证</th>
                <th className="py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/40">
                  <td className="py-2 font-mono text-xs">{row.order_no}</td>
                  <td className="py-2 font-mono text-xs">{row.user_id}</td>
                  <td className="py-2">
                    {row.plan} / {row.period}
                  </td>
                  <td className="py-2">{row.amount}</td>
                  <td className="py-2">{row.status}</td>
                  <td className="py-2">
                    {row.proof_image_url ? (
                      <a className="underline" target="_blank" rel="noreferrer" href={row.proof_image_url}>
                        查看
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => void approve(row.id)}
                        disabled={row.status !== "pending_approval"}
                      >
                        通过
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void reject(row.id)}
                        disabled={row.status !== "pending_approval"}
                      >
                        驳回
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {loading ? <p className="text-sm text-muted-foreground">加载中...</p> : null}
      {error ? <p className="text-sm text-amber-300">{error}</p> : null}
    </main>
  );
}
