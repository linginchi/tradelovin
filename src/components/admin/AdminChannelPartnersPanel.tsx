"use client";

import { Loader2, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";

type PartnerRow = {
  id: string;
  channel_name: string;
  channel_type: string;
  platform: string | null;
  status: string;
  total_earned: number;
  total_paid: number;
  studentCount: number;
  monthEstimate: number;
  created_at: string;
};

export function AdminChannelPartnersPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/channel-partners");
      const json: { success?: boolean; error?: string; data?: { rows: PartnerRow[] } } = await res.json();
      if (json.success && json.data) setRows(json.data.rows);
      else setError(json.error ?? "加载失败");
    } catch {
      setError("加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = rows.filter((r) =>
    r.channel_name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">渠道合作伙伴</h1>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Plus className="size-3" /> 新建入口在管理员页面
        </span>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="搜索 KOL 名称..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
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
                <th className="px-4 py-3 font-medium">名称</th>
                <th className="px-4 py-3 font-medium">类型</th>
                <th className="px-4 py-3 font-medium">平台</th>
                <th className="px-4 py-3 font-medium">学员数</th>
                <th className="px-4 py-3 font-medium">本月预估</th>
                <th className="px-4 py-3 font-medium">累计佣金</th>
                <th className="px-4 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer border-b border-border/40 hover:bg-white/5"
                  onClick={() =>
                    (window.location.href = `/cjkzt/channel-partners/${r.id}`)
                  }
                >
                  <td className="px-4 py-3 font-medium">{r.channel_name}</td>
                  <td className="px-4 py-3">
                    {r.channel_type === "kol" ? "KOL" : "渠道"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.platform ?? "—"}
                  </td>
                  <td className="px-4 py-3">{r.studentCount}</td>
                  <td className="px-4 py-3 text-emerald-400">
                    ¥{r.monthEstimate.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    应得 ¥{r.total_earned.toLocaleString()} / 已付 ¥
                    {r.total_paid.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        r.status === "active"
                          ? "bg-emerald-400/10 text-emerald-400"
                          : r.status === "paused"
                            ? "bg-amber-400/10 text-amber-400"
                            : "bg-red-400/10 text-red-400"
                      }`}
                    >
                      {r.status === "active"
                        ? "正常"
                        : r.status === "paused"
                          ? "暂停"
                          : "已终止"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
