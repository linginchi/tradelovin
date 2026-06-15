"use client";

import { Loader2, Plus, Search, Ticket } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  payout_info?: Record<string, unknown> | null;
};

type UserSearchResult = {
  id: string;
  email: string;
  display_name: string;
};

// ── QR 码生成 ──────────────────────────────────────────
async function qrDataUrl(text: string): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(text, { width: 200, margin: 2, color: { dark: "#14b8a6", light: "#ffffff00" } });
}

// ── 邀请码对话框（含 QR 码） ────────────────────────────
function InviteCodeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [count, setCount] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [codes, setCodes] = useState<{ code: string; qr: string }[]>([]);

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
        const origin = window.location.origin;
        const withQr = await Promise.all(
          json.data.codes.map(async (code) => {
            const inviteUrl = `${origin}/register?invite=${code}`;
            const qr = await qrDataUrl(inviteUrl);
            return { code, qr };
          }),
        );
        setCodes(withQr);
      } else {
        setError(json.error ?? "生成失败");
      }
    } catch {
      setError("请求失败");
    } finally {
      setGenerating(false);
    }
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-6 shadow-xl max-h-[90vh] overflow-y-auto">
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
          <div className="mt-4 space-y-4">
            {codes.map(({ code, qr }) => (
              <div key={code} className="rounded-xl border border-border/70 bg-background p-3 text-center">
                <div className="mb-2 flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt={`QR for ${code}`} className="size-32" />
                </div>
                <div className="font-mono text-sm text-emerald-400">{code}</div>
                <div className="mt-2 flex gap-2 justify-center">
                  <Button variant="outline" size="sm" onClick={() => void copyCode(code)}>复制邀请码</Button>
                  <Button variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/register?invite=${code}`)}>
                    复制链接
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setCodes([])}>重新生成</Button>
            </div>
            <button type="button" className="w-full text-center text-xs text-muted-foreground hover:text-foreground" onClick={onClose}>关闭</button>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-amber-300">{error}</p>}
      </div>
    </div>
  );
}

// ── 手动新增 KOL 对话框 ────────────────────────────────
function AddKOLDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [searchQ, setSearchQ] = useState("");
  const [users, setUsers] = useState<UserSearchResult[]>([]);
  const [selected, setSelected] = useState<UserSearchResult | null>(null);
  const [channelName, setChannelName] = useState("");
  const [platform, setPlatform] = useState("xiaohongshu");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!open) {
      setSearchQ("");
      setUsers([]);
      setSelected(null);
      setChannelName("");
      setPlatform("xiaohongshu");
      setError("");
    }
  }, [open]);

  function handleSearch(v: string) {
    setSearchQ(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length < 2) { setUsers([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/kol-users-search?q=${encodeURIComponent(v.trim())}`);
        const json: { success?: boolean; data?: { rows: UserSearchResult[] } } = await res.json();
        if (json.success) setUsers(json.data?.rows ?? []);
      } catch { /* ignore */ }
    }, 300);
  }

  async function handleSubmit() {
    if (!selected) return;
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/channel-partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selected.id,
          channelName: channelName.trim() || selected.display_name || selected.email.split("@")[0],
          channelType: "kol",
          platform,
        }),
      });
      const json: { success?: boolean; error?: string } = await res.json();
      if (json.success) {
        onSuccess();
        onClose();
      } else {
        setError(json.error ?? "创建失败");
      }
    } catch {
      setError("请求失败");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-6 shadow-xl">
        <h2 className="text-lg font-semibold">手动新增 KOL</h2>
        <p className="mt-1 text-xs text-muted-foreground">为已有账号的用户开通 KOL 身份</p>
        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm">搜索用户（邮箱或昵称）</label>
            <Input
              placeholder="输入至少 2 个字符搜索..."
              value={searchQ}
              onChange={(e) => handleSearch(e.target.value)}
            />
            {users.length > 0 && (
              <div className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded-lg border border-border/60 bg-background p-1">
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                      selected?.id === u.id ? "bg-cyan-500/20 text-cyan-300" : "hover:bg-white/5"
                    }`}
                    onClick={() => { setSelected(u); setChannelName(u.display_name); }}
                  >
                    {u.display_name} <span className="text-muted-foreground">({u.email})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selected && (
            <>
              <div>
                <label className="mb-1.5 block text-sm">渠道名称</label>
                <Input value={channelName} onChange={(e) => setChannelName(e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm">平台</label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="w-full rounded-xl border border-border/70 bg-background px-3 py-2.5 text-sm outline-none"
                >
                  <option value="xiaohongshu">小红书</option>
                  <option value="douyin">抖音</option>
                  <option value="weibo">微博</option>
                  <option value="bilibili">B站</option>
                  <option value="youtube">YouTube</option>
                  <option value="instagram">Instagram</option>
                  <option value="twitter">Twitter/X</option>
                  <option value="other">其他</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={onClose}>取消</Button>
                <Button className="flex-1" disabled={!selected || submitting} onClick={() => void handleSubmit()}>
                  {submitting ? <><Loader2 className="mr-2 size-4 animate-spin" /> 创建中...</> : "确认开通"}
                </Button>
              </div>
            </>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-amber-300">{error}</p>}
      </div>
    </div>
  );
}

// ── 主面板 ─────────────────────────────────────────────
export function AdminChannelPartnersPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [pendingRows, setPendingRows] = useState<Partial<PartnerRow>[]>([]);
  const [search, setSearch] = useState("");
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [tab, setTab] = useState<"active" | "pending">("active");

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

  async function loadPending() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/channel-partners/pending");
      const json: { success?: boolean; error?: string; data?: { rows: Partial<PartnerRow>[] } } = await res.json();
      if (json.success && json.data) setPendingRows(json.data.rows);
      else setError(json.error ?? "加载失败");
    } catch {
      setError("加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function approveSelf(id: string) {
    const res = await fetch(`/api/admin/channel-partners/${id}/approve`, { method: "POST" });
    const json: { success?: boolean } = await res.json();
    if (json.success) void loadPending();
  }

  async function rejectSelf(id: string) {
    const res = await fetch(`/api/admin/channel-partners/${id}/reject`, { method: "POST" });
    const json: { success?: boolean } = await res.json();
    if (json.success) void loadPending();
  }

  useEffect(() => {
    void (tab === "active" ? load() : loadPending());
  }, [tab]);

  const filtered = rows.filter((r) =>
    r.channel_name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">渠道合作伙伴</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="mr-1.5 size-4" /> 手动新增 KOL
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowInviteDialog(true)}>
            <Ticket className="mr-1.5 size-4" /> 生成邀请码
          </Button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-border/60 pb-2">
        <button
          type="button"
          className={`text-sm font-medium ${tab === "active" ? "text-cyan-300" : "text-muted-foreground"}`}
          onClick={() => setTab("active")}
        >
          已开通 KOL
        </button>
        <button
          type="button"
          className={`text-sm font-medium ${tab === "pending" ? "text-cyan-300" : "text-muted-foreground"}`}
          onClick={() => setTab("pending")}
        >
          待审核 ({pendingRows.length})
        </button>
      </div>

      {tab === "active" && (
      <>
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
      </>
      )}

      {tab === "pending" &&
        (loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> 加载中...
          </div>
        ) : error ? (
          <p className="text-amber-300">{error}</p>
        ) : pendingRows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">暂无待审核申请</p>
        ) : (
          <div className="rounded-xl border border-border/70">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">名称</th>
                  <th className="px-4 py-3 font-medium">平台</th>
                  <th className="px-4 py-3 font-medium">社交链接</th>
                  <th className="px-4 py-3 font-medium">申请时间</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {pendingRows.map((r) => {
                  const payoutInfo = r.payout_info as Record<string, unknown> | null;
                  const socialUrl = String(payoutInfo?.social_url ?? "—");
                  return (
                    <tr key={r.id} className="border-b border-border/40">
                      <td className="px-4 py-3 font-medium">{String(r.channel_name ?? "")}</td>
                      <td className="px-4 py-3">{String(r.platform ?? "—")}</td>
                      <td className="px-4 py-3">
                        {socialUrl !== "—" ? (
                          <a
                            href={socialUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-cyan-400 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            查看主页
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => r.id && void approveSelf(r.id)}>
                            通过
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => r.id && void rejectSelf(r.id)}>
                            驳回
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

      <InviteCodeDialog open={showInviteDialog} onClose={() => setShowInviteDialog(false)} />
      <AddKOLDialog open={showAddDialog} onClose={() => setShowAddDialog(false)} onSuccess={() => void load()} />
    </div>
  );
}
