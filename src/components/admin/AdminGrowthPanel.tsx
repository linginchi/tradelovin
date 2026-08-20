"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { getDisplayLevel } from "@/lib/membership/level-mapping";

type MembershipRow = {
  id: string;
  user_id: string;
  plan: string;
  status: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  student_id?: string | null;
  name?: string;
  email?: string | null;
  level_label?: string;
  is_seed?: boolean;
  is_admin?: boolean;
  admin_role?: string | null;
  is_super_user?: boolean;
  is_coach?: boolean;
};

type PointRow = {
  user_id: string;
  balance: number;
  total_earned: number;
  total_spent: number;
  updated_at: string;
  student_id?: string | null;
  name?: string;
  email?: string | null;
  is_seed?: boolean;
  is_admin?: boolean;
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
  const [assigning, setAssigning] = useState(false);
  const [query, setQuery] = useState("");
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
      const mJson = (await mRes.json()) as { data?: MembershipRow[] };
      const pJson = (await pRes.json()) as { data?: PointRow[] };
      const payJson = (await payRes.json()) as { data?: PaymentRow[] };
      const rJson = (await rRes.json()) as { data?: ReferralSummary | null };
      if (!mRes.ok || !pRes.ok || !payRes.ok || !rRes.ok) {
        setError("后台数据加载失败");
        return;
      }
      setMemberships(mJson.data ?? []);
      setPoints(pJson.data ?? []);
      setPayments(payJson.data ?? []);
      setReferrals(rJson.data ?? null);
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

  async function assignMissingStudentCodes() {
    setAssigning(true);
    setError("");
    try {
      const res = await fetch("/api/admin/membership/student-codes", {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as { success?: boolean; error?: string; data?: { assigned?: number } };
      if (!res.ok || !json.success) {
        setError(json.error ?? "补发学号失败");
        return;
      }
      await load();
    } catch {
      setError("补发学号失败");
    } finally {
      setAssigning(false);
    }
  }

  const q = query.trim().toLowerCase();
  const visibleMemberships = memberships.filter((row) => {
    if (!q) return true;
    const hay = [row.student_id, row.name, row.email, row.user_id, row.level_label, row.plan, row.status]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">会员管理</h2>
            <p className="text-muted-foreground mt-1 max-w-3xl text-xs">
              学号：课程报读审批仍发 <span className="font-mono">BD0001</span>；平台会员用{" "}
              <span className="font-mono">TL + 年份后两位 + 4 位流水</span>（如 TL260001）。已有学号不改。Seed
              表示测试快捷登录或超管白名单账号。
            </p>
          </div>
          <Button variant="outline" disabled={assigning} onClick={() => void assignMissingStudentCodes()}>
            {assigning ? "补发中..." : "为无学号会员补发"}
          </Button>
        </div>
        <div className="mt-3">
          <input
            className="w-full max-w-md rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="搜索学号、姓名、邮箱、用户ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="py-2">学号</th>
                <th className="py-2">姓名</th>
                <th className="py-2">邮箱</th>
                <th className="py-2">级别</th>
                <th className="py-2">状态</th>
                <th className="py-2">Seed</th>
                <th className="py-2">管理员</th>
                <th className="py-2">到期时间</th>
                <th className="py-2">用户ID</th>
              </tr>
            </thead>
            <tbody>
              {visibleMemberships.slice(0, 200).map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border/40 cursor-pointer hover:bg-muted/40"
                  onClick={() => setAdjustForm((v) => ({ ...v, userId: row.user_id }))}
                >
                  <td className="py-2 font-mono text-xs">{row.student_id ?? "未分配"}</td>
                  <td className="py-2">
                    {row.name ?? "未建档"}
                    {row.is_coach ? <span className="ml-1 text-[11px] text-amber-300">教练</span> : null}
                  </td>
                  <td className="py-2 font-mono text-xs">{row.email ?? "—"}</td>
                  <td className="py-2">
                    {row.level_label ??
                      (() => {
                        const level = getDisplayLevel(row.plan);
                        return `${level.code} · ${level.nameZh}`;
                      })()}
                  </td>
                  <td className="py-2">{row.status}</td>
                  <td className="py-2">{row.is_seed ? "是" : "否"}</td>
                  <td className="py-2">
                    {row.is_admin ? (row.admin_role === "super_admin" ? "超管" : "管理员") : "否"}
                    {row.is_super_user && !row.is_admin ? <span className="ml-1 text-[11px]">白名单</span> : null}
                  </td>
                  <td className="py-2">{new Date(row.current_period_end).toLocaleString()}</td>
                  <td className="text-muted-foreground py-2 font-mono text-[11px]">{row.user_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          共 {memberships.length} 人，当前显示 {Math.min(visibleMemberships.length, 200)} 人。点击行可填入下方积分调整的用户ID。
        </p>
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
                <th className="py-2">学号</th>
                <th className="py-2">姓名</th>
                <th className="py-2">邮箱</th>
                <th className="py-2">余额</th>
                <th className="py-2">累计获得</th>
                <th className="py-2">累计消耗</th>
              </tr>
            </thead>
            <tbody>
              {points.slice(0, 100).map((row) => (
                <tr
                  key={row.user_id}
                  className="border-b border-border/40 cursor-pointer hover:bg-muted/40"
                  onClick={() => setAdjustForm((v) => ({ ...v, userId: row.user_id }))}
                >
                  <td className="py-2 font-mono text-xs">{row.student_id ?? "未分配"}</td>
                  <td className="py-2">
                    {row.name ?? "未建档"}
                    {row.is_seed ? <span className="ml-1 text-[11px] text-amber-300">Seed</span> : null}
                    {row.is_admin ? <span className="ml-1 text-[11px]">管理员</span> : null}
                  </td>
                  <td className="py-2 font-mono text-xs">{row.email ?? "—"}</td>
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
