"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  getDisplayLevel,
  getLocalizedLevelDescription,
  getLocalizedLevelLabel,
} from "@/lib/membership/level-mapping";

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

export function MyMembershipClient() {
  const locale = useLocale();
  const t = useTranslations("membership.level");
  const [membership, setMembership] = useState<Membership | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [mRes, tRes] = await Promise.all([
          fetch("/api/membership/current", { credentials: "include" }),
          fetch("/api/membership/transactions", { credentials: "include" }),
        ]);
        const mJson = (await mRes.json()) as { success?: boolean; data?: Membership };
        const tJson = (await tRes.json()) as { success?: boolean; data?: Transaction[] };
        if (!mRes.ok || !tRes.ok) {
          setError("加载会员信息失败");
          return;
        }
        setMembership(mJson.data ?? null);
        setTransactions(tJson.data ?? []);
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
            {(() => {
              const level = getDisplayLevel(membership.plan);
              return (
                <div className="rounded-xl border border-border/70 p-3 sm:col-span-2">
                  <p className="text-xs text-muted-foreground">{t("currentLevel")}</p>
                  <p className="text-lg font-semibold">{getLocalizedLevelLabel(level, locale)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{getLocalizedLevelDescription(level, locale)}</p>
                </div>
              );
            })()}
            <div className="rounded-xl border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">当前会员等级</p>
              <p className="text-lg font-semibold">{getLocalizedLevelLabel(getDisplayLevel(membership.plan), locale)}</p>
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

      {error ? <p className="text-sm text-amber-300">{error}</p> : null}
    </main>
  );
}
