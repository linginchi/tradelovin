"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function AdminChannelPartnerDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState<Record<string, unknown> | null>(null);
  const [referrals, setReferrals] = useState<Array<Record<string, unknown>>>(
    [],
  );
  const [payouts, setPayouts] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    async function load() {
      const [detailRes, refRes, commRes] = await Promise.all([
        fetch(`/api/admin/channel-partners/${id}`),
        fetch(`/api/admin/channel-partners/${id}/referrals`),
        fetch(`/api/admin/channel-partners/${id}/commissions`),
      ]);
      const detailJson = await detailRes.json();
      if (detailJson.success) setPartner(detailJson.data.partner);
      const refJson = await refRes.json();
      if (refJson.success) setReferrals(refJson.data.rows);
      const commJson = await commRes.json();
      if (commJson.success) setPayouts(commJson.data.payouts);
      setLoading(false);
    }
    void load();
  }, [id]);

  if (loading) {
    return (
      <main className="p-4">
        <Loader2 className="size-4 animate-spin" /> 加载中...
      </main>
    );
  }
  if (!partner) {
    return <main className="p-4 text-amber-300">KOL 不存在</main>;
  }

  return (
    <main className="space-y-6 p-4">
      <h1 className="text-xl font-semibold">
        {String(partner.channel_name ?? "")}
      </h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">状态</p>
          <p>
            {partner.status === "active"
              ? "正常"
              : String(partner.status ?? "")}
          </p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">分佣比例</p>
          <p>{Number(partner.commission_rate ?? 0) * 100}%</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">累计应得</p>
          <p className="text-emerald-400">
            ¥{Number(partner.total_earned ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">累计已付</p>
          <p>¥{Number(partner.total_paid ?? 0).toLocaleString()}</p>
        </div>
      </div>

      {/* 引入学员 */}
      <div className="rounded-xl border">
        <h2 className="border-b px-4 py-3 font-medium">
          引入学员 ({referrals.length})
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-4 py-2">学员</th>
              <th className="px-4 py-2">状态</th>
              <th className="px-4 py-2">学费</th>
              <th className="px-4 py-2">佣金</th>
              <th className="px-4 py-2">佣金状态</th>
            </tr>
          </thead>
          <tbody>
            {referrals.map((r) => (
              <tr key={String(r.id)} className="border-b">
                <td className="px-4 py-2">{String(r.studentName ?? "")}</td>
                <td className="px-4 py-2">{String(r.status ?? "")}</td>
                <td className="px-4 py-2">
                  {r.tuitionAmount != null
                    ? `¥${Number(r.tuitionAmount).toLocaleString()}`
                    : "—"}
                </td>
                <td className="px-4 py-2 text-emerald-400">
                  {r.commissionAmount != null
                    ? `¥${Number(r.commissionAmount).toLocaleString()}`
                    : "—"}
                </td>
                <td className="px-4 py-2">
                  {String(r.commissionStatus ?? "—")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 月结记录 */}
      <div className="rounded-xl border">
        <h2 className="border-b px-4 py-3 font-medium">
          月度结算 ({payouts.length})
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-4 py-2">月份</th>
              <th className="px-4 py-2">金额</th>
              <th className="px-4 py-2">状态</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((p) => (
              <tr key={String(p.id)} className="border-b">
                <td className="px-4 py-2">
                  {String(p.settlement_month ?? "")}
                </td>
                <td className="px-4 py-2 font-medium">
                  ¥{Number(p.total_commission).toLocaleString()}
                </td>
                <td className="px-4 py-2">{String(p.status ?? "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
