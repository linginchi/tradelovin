"use client";

import { Check, CircleDollarSign, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type PayoutRow = {
  id: string;
  partner_id: string;
  settlement_month: string;
  total_commission: number;
  status: string;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  channel_partners: {
    channel_name: string;
    channel_type: string;
    platform: string | null;
  };
};

type MonthStat = {
  month: string;
  total: number;
  pendingCount: number;
  paidCount: number;
};

export function AdminCommissionPayoutsPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [monthStats, setMonthStats] = useState<MonthStat[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/commission-payouts");
      const json: {
        success?: boolean;
        error?: string;
        data?: {
          rows: PayoutRow[];
          monthStats: MonthStat[];
        };
      } = await res.json();
      if (json.success && json.data) {
        setRows(json.data.rows);
        setMonthStats(json.data.monthStats);
        if (json.data.monthStats.length > 0) {
          setSelectedMonth(json.data.monthStats[0].month);
        }
      } else setError(json.error ?? "加载失败");
    } catch {
      setError("加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function approve(payoutId: string) {
    const res = await fetch(
      `/api/admin/commission-payouts/${payoutId}/approve`,
      { method: "POST" },
    );
    const json: { success?: boolean } = await res.json();
    if (json.success) void load();
  }

  async function markPaid(payoutId: string) {
    const res = await fetch(`/api/admin/commission-payouts/${payoutId}/pay`, {
      method: "POST",
    });
    const json: { success?: boolean } = await res.json();
    if (json.success) void load();
  }

  const filteredRows = selectedMonth
    ? rows.filter((r) => r.settlement_month === selectedMonth)
    : rows;

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">分佣月结</h1>

      {/* 月份选择器 */}
      <div className="flex flex-wrap gap-2">
        {monthStats.map((s) => (
          <button
            key={s.month}
            type="button"
            className={`rounded-lg px-3 py-1.5 text-sm ${
              selectedMonth === s.month
                ? "bg-cyan-500/20 text-cyan-200"
                : "bg-card/30 text-muted-foreground hover:bg-card/50"
            }`}
            onClick={() => setSelectedMonth(s.month)}
          >
            {s.month} (¥{s.total.toLocaleString()})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 加载中...
        </div>
      ) : error ? (
        <p className="text-amber-300">{error}</p>
      ) : (
        <div className="rounded-xl border border-border/70">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">KOL</th>
                <th className="px-4 py-3 font-medium">类型</th>
                <th className="px-4 py-3 font-medium">佣金金额</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    暂无月结数据
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <tr key={r.id} className="border-b border-border/40">
                    <td className="px-4 py-3 font-medium">
                      {r.channel_partners.channel_name}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.channel_partners.channel_type === "kol"
                        ? "KOL"
                        : "渠道"}
                    </td>
                    <td className="px-4 py-3 font-medium text-emerald-400">
                      ¥{r.total_commission.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {r.status === "paid"
                        ? "已打款"
                        : r.status === "approved"
                          ? "已审核"
                          : r.status === "pending"
                            ? "待审核"
                            : "已取消"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {r.status === "pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void approve(r.id)}
                          >
                            <Check className="mr-1 size-3" /> 审核通过
                          </Button>
                        )}
                        {r.status === "approved" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void markPaid(r.id)}
                          >
                            <CircleDollarSign className="mr-1 size-3" />{" "}
                            标记已打款
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
