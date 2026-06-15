"use client";

import { Loader2, Plus, Search, Ticket } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
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

function InviteCodeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [count, setCount] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [codes, setCodes] = useState<string[]>([]);

  if (!open) return null;

  async function handleGenerate() {
    setError("");
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/kol-invite-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      const json: { success?: boolean; error?: string; data?: { codes: string[] } } = await res.json();
      if (json.success && json.data) {
        setCodes(json.data.codes);
      } else {
        setError(json.error ?? "生成失败");
      }
    } catch {
      setError("请求失败");
    } finally {
      setGenerating(false);
    }
  }

  async function copyAll() {
    await navigator.clipboard.writeText(codes.join("\n"));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-border/70 bg-card p-6 shadow-xl">
        <h2 className="text-lg font-semibold">生成 KOL 邀请码</h2>
        <p className="mt-1 text-xs text-muted-foreground">生成的邀请码可发给意向 KOL 自行注册</p>
        {codes.length === 0 ? (
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm">数量</label>
              <Input type="number" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>取消</Button>
              <Button className="flex-1" disabled={generating} onClick={() => void handleGenerate()}>
                {generating ? <><Loader2 className="mr-2 size-4 animate-spin" /> 生成中...</> : "生成"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border/70 bg-background p-3">
              {codes.map((c, i) => (
                <div key={c} className="font-mono text-sm text-emerald-400">{i + 1}. {c}</div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setCodes([])}>重新生成</Button>
              <Button className="flex-1" onClick={() => void copyAll()}>复制全部</Button>
            </div>
            <button type="button" className="w-full text-center text-xs text-muted-foreground hover:text-foreground" onClick={onClose}>关闭</button>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-amber-300">{error}</p>}
      </div>
    </div>
  );
}

export function AdminChannelPartnersPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [search, setSearch] = useState("");
  const [showInviteDialog, setShowInviteDialog] = useState(false);

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
        <Button variant="outline" size="sm" onClick={() => setShowInviteDialog(true)}>
          <Ticket className="mr-1.5 size-4" /> 生成邀请码
        </Button>
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
