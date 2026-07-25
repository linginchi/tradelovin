"use client";

import { Copy, Loader2, Plus, Share2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  KOL_MAX_PLATFORM_ACCOUNTS,
  KOL_PLATFORMS,
  type KolPlatform,
  type PlatformAccount,
} from "@/lib/channel-partner/kol-application-constants";

type PartnerData = {
  partner: {
    id: string;
    channelName: string;
    channelType: string;
    platform: string | null;
    commissionRate: number;
    status: string;
    payoutInfo: Record<string, unknown> | null;
  };
  stats: {
    monthEstimate: number;
    totalEarned: number;
    totalPaid: number;
    pendingAmount: number;
  };
};

type ReferralRow = {
  id: string;
  code: string;
  studentName: string;
  status: string;
  tuitionAmount: number;
  commissionAmount: number;
  commissionStatus: string | null;
  createdAt: string;
  completedAt: string | null;
};

const PLATFORM_LABEL_KEYS: Record<KolPlatform, string> = {
  xiaohongshu: "platformXiaohongshu",
  douyin: "platformDouyin",
  weibo: "platformWeibo",
  bilibili: "platformBilibili",
  youtube: "platformYoutube",
  instagram: "platformInstagram",
  twitter: "platformTwitter",
  other: "platformOther",
};

function emptyPlatformRow(): PlatformAccount {
  return { platform: "xiaohongshu", account: "" };
}

function SelfApplySubmittedPanel() {
  const t = useTranslations("KolApply");
  return (
    <div className="mx-auto max-w-md space-y-4 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-500/20">
        <Share2 className="size-8 text-emerald-400" />
      </div>
      <h2 className="text-xl font-semibold">{t("applicationSubmitted")}</h2>
      <p className="text-sm text-muted-foreground">{t("applicationSubmittedHint")}</p>
    </div>
  );
}

function ApplyPanel({ onSuccess }: { onSuccess: () => void }) {
  const t = useTranslations("KolApply");
  const [mode, setMode] = useState<"invite" | "self">("self");
  const [selfStep, setSelfStep] = useState<"form" | "verifying_otp" | "submitted">("form");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [platformAccounts, setPlatformAccounts] = useState<PlatformAccount[]>([
    emptyPlatformRow(),
  ]);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function updatePlatformAccount(index: number, patch: Partial<PlatformAccount>) {
    setPlatformAccounts((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function addPlatformRow() {
    if (platformAccounts.length >= KOL_MAX_PLATFORM_ACCOUNTS) return;
    setPlatformAccounts((rows) => [...rows, emptyPlatformRow()]);
  }

  function removePlatformRow(index: number) {
    if (platformAccounts.length <= 1) return;
    setPlatformAccounts((rows) => rows.filter((_, i) => i !== index));
  }

  const selfFormValid =
    email.trim().length > 0 &&
    platformAccounts.every((row) => row.account.trim().length > 0);

  async function handleInviteSubmit() {
    setError("");
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { inviteCode: code };
      if (name.trim()) body.channelName = name.trim();
      const res = await fetch("/api/channel-partner/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json: { success?: boolean; error?: string } = await res.json();
      if (json.success) {
        onSuccess();
      } else {
        setError(json.error ?? t("applyFailed"));
      }
    } catch {
      setError(t("requestFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSelfSubmit() {
    setError("");
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        email: email.trim(),
        platformAccounts: platformAccounts.map((row) => ({
          platform: row.platform,
          account: row.account.trim(),
        })),
      };
      if (name.trim()) body.channelName = name.trim();
      const res = await fetch("/api/channel-partner/apply-self", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json: { success?: boolean; error?: string; message?: string } = await res.json();
      if (json.success) {
        setSelfStep("verifying_otp");
      } else {
        setError(json.error ?? t("submitFailed"));
      }
    } catch {
      setError(t("requestFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyOtp() {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/channel-partner/apply-self/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: otpCode.trim() }),
      });
      const json: { success?: boolean; error?: string } = await res.json();
      if (json.success) {
        setSelfStep("submitted");
      } else {
        setError(json.error ?? t("otpInvalid"));
      }
    } catch {
      setError(t("requestFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === "self" && selfStep === "submitted") {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <h1 className="text-center text-2xl font-semibold">{t("title")}</h1>
        <SelfApplySubmittedPanel />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-center text-2xl font-semibold">{t("title")}</h1>

      <div className="flex rounded-xl border border-border/70 bg-card/35 p-1">
        <button
          type="button"
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            mode === "invite"
              ? "bg-cyan-500/20 text-cyan-300"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setMode("invite")}
        >
          {t("tabInvite")}
        </button>
        <button
          type="button"
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            mode === "self"
              ? "bg-cyan-500/20 text-cyan-300"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setMode("self")}
        >
          {t("tabSelf")}
        </button>
      </div>

      <div className="space-y-4">
        {mode === "invite" ? (
          <div>
            <label className="mb-1.5 block text-sm text-muted-foreground">
              {t("inviteCode")}
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("inviteCodePlaceholder")}
              className="w-full rounded-xl border border-border/70 bg-background px-3 py-2.5 text-sm outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30"
            />
            <p className="mt-1 text-xs text-muted-foreground">{t("inviteLoginHint")}</p>
          </div>
        ) : selfStep === "verifying_otp" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("otpSent", { email })}</p>
            <div>
              <label className="mb-1.5 block text-sm text-muted-foreground">
                {t("otpLabel")}
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder={t("otpPlaceholder")}
                className="w-full rounded-xl border border-border/70 bg-background px-3 py-2.5 text-sm tracking-widest outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30"
              />
            </div>
            <Button
              className="w-full"
              disabled={submitting || otpCode.length !== 6}
              onClick={() => void handleVerifyOtp()}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> {t("submitting")}
                </>
              ) : (
                t("verifyOtp")
              )}
            </Button>
            <button
              type="button"
              className="w-full text-sm text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => {
                setSelfStep("form");
                setOtpCode("");
              }}
            >
              {t("backToForm")}
            </button>
          </div>
        ) : (
          <>
            <div>
              <label className="mb-1.5 block text-sm text-muted-foreground">
                {t("email")} <span className="text-amber-400">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("emailPlaceholder")}
                className="w-full rounded-xl border border-border/70 bg-background px-3 py-2.5 text-sm outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30"
              />
              <p className="mt-1 text-xs text-muted-foreground">{t("emailHint")}</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">
                  {t("platformAccounts")} <span className="text-amber-400">*</span>
                </label>
                {platformAccounts.length < KOL_MAX_PLATFORM_ACCOUNTS && (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"
                    onClick={addPlatformRow}
                  >
                    <Plus className="size-3.5" /> {t("addPlatform")}
                  </button>
                )}
              </div>
              {platformAccounts.map((row, index) => (
                <div key={index} className="flex gap-2">
                  <select
                    value={row.platform}
                    onChange={(e) =>
                      updatePlatformAccount(index, {
                        platform: e.target.value as KolPlatform,
                      })
                    }
                    className="w-32 shrink-0 rounded-xl border border-border/70 bg-background px-2 py-2.5 text-sm outline-none focus:border-cyan-500/60"
                  >
                    {KOL_PLATFORMS.map((p) => (
                      <option key={p} value={p}>
                        {t(PLATFORM_LABEL_KEYS[p])}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={row.account}
                    onChange={(e) => updatePlatformAccount(index, { account: e.target.value })}
                    placeholder={t("platformAccountPlaceholder")}
                    className="min-w-0 flex-1 rounded-xl border border-border/70 bg-background px-3 py-2.5 text-sm outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30"
                  />
                  {platformAccounts.length > 1 && (
                    <button
                      type="button"
                      className="shrink-0 rounded-xl border border-border/70 px-2 text-muted-foreground hover:text-foreground"
                      onClick={() => removePlatformRow(index)}
                      aria-label={t("removePlatform")}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              ))}
              <p className="text-xs text-muted-foreground">{t("maxPlatforms")}</p>
            </div>
          </>
        )}

        {!(mode === "self" && selfStep === "verifying_otp") && (
          <div>
            <label className="mb-1.5 block text-sm text-muted-foreground">
              {t("channelName")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("channelNamePlaceholder")}
              className="w-full rounded-xl border border-border/70 bg-background px-3 py-2.5 text-sm outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30"
            />
          </div>
        )}

        {!(mode === "self" && selfStep === "verifying_otp") && (
          <Button
            className="w-full"
            disabled={
              submitting ||
              (mode === "invite" ? !code.trim() : !selfFormValid)
            }
            onClick={() =>
              mode === "invite" ? void handleInviteSubmit() : void handleSelfSubmit()
            }
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" /> {t("submitting")}
              </>
            ) : mode === "self" ? (
              t("sendOtp")
            ) : (
              t("submit")
            )}
          </Button>
        )}

        {error && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function PendingReviewPanel({ reviewInfo }: { reviewInfo: { platform?: string; socialUrl?: string; submittedAt?: string } }) {
  const platformNames: Record<string, string> = {
    xiaohongshu: "小红书",
    douyin: "抖音",
    weibo: "微博",
    bilibili: "B站",
    youtube: "YouTube",
    instagram: "Instagram",
    twitter: "Twitter/X",
    other: "其他",
  };
  return (
    <div className="mx-auto max-w-md space-y-6 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-amber-500/20">
        <Loader2 className="size-8 animate-spin text-amber-400" />
      </div>
      <h1 className="text-xl font-semibold">审核中</h1>
      <p className="text-sm text-muted-foreground">
        您的KOL合作申请已提交，管理员正在审核您的社交平台信息，请耐心等待。
      </p>
      {reviewInfo.platform && (
        <div className="rounded-xl border border-border/70 bg-card/35 p-4 text-left text-sm">
          <p className="text-muted-foreground">
            平台：{platformNames[reviewInfo.platform] ?? reviewInfo.platform}
          </p>
          {reviewInfo.socialUrl && (
            <p className="mt-1 truncate text-muted-foreground">
              链接：{reviewInfo.socialUrl}
            </p>
          )}
          {reviewInfo.submittedAt && (
            <p className="mt-1 text-muted-foreground">
              提交时间：{new Date(reviewInfo.submittedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function PartnerDashboardClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isPartner, setIsPartner] = useState(false);
  const [isPendingReview, setIsPendingReview] = useState(false);
  const [reviewInfo, setReviewInfo] = useState<{ platform?: string; socialUrl?: string; submittedAt?: string }>({});
  const [data, setData] = useState<PartnerData | null>(null);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [inviteLink, setInviteLink] = useState("");
  const [tab, setTab] = useState<"referrals" | "payouts">("referrals");
  const [payouts, setPayouts] = useState<Array<Record<string, unknown>>>([]);

  async function loadProfile() {
    setLoading(true);
    setError("");
    try {
      const profileRes = await fetch("/api/channel-partner/my-profile", {
        credentials: "include",
      });

      if (profileRes.status === 401) {
        setIsPartner(false);
        setIsPendingReview(false);
        return;
      }

      const profileJson: {
        success?: boolean;
        isPartner?: boolean;
        isPendingReview?: boolean;
        reviewInfo?: { platform?: string; socialUrl?: string; submittedAt?: string };
        data?: PartnerData & { referralCode?: string };
        error?: string;
      } = await profileRes.json();

      if (profileJson.isPendingReview) {
        setIsPartner(false);
        setIsPendingReview(true);
        setReviewInfo(profileJson.reviewInfo ?? {});
        return;
      }

      if (!profileJson.isPartner) {
        setIsPartner(false);
        setIsPendingReview(false);
        return;
      }

      setIsPartner(true);
      setData(profileJson.data!);
      if (profileJson.data?.referralCode) {
        setInviteLink(
          `${window.location.origin}/register?ref=${profileJson.data.referralCode}`,
        );
      }

      const referralRes = await fetch(
        "/api/channel-partner/my-referrals",
        { credentials: "include" },
      );

      const referralJson: {
        success?: boolean;
        data?: { rows: ReferralRow[] };
      } = await referralRes.json();
      if (referralJson.success)
        setReferrals(referralJson.data?.rows ?? []);

      const commissionRes = await fetch("/api/channel-partner/my-commissions", {
        credentials: "include",
      });
      const commissionJson: {
        success?: boolean;
        data?: { payouts: Array<Record<string, unknown>> };
      } = await commissionRes.json();
      if (commissionJson.success)
        setPayouts(commissionJson.data?.payouts ?? []);
    } catch {
      setError("加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProfile();
  }, []);

  async function copyLink() {
    await navigator.clipboard.writeText(inviteLink);
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 加载中...
        </div>
      </main>
    );
  }

  if (isPendingReview) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <PendingReviewPanel reviewInfo={reviewInfo} />
      </main>
    );
  }

  if (!isPartner) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <ApplyPanel onSuccess={() => void loadProfile()} />
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-amber-300">{error ?? "数据加载失败"}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <section className="rounded-2xl border border-border/70 bg-card/35 p-6">
        <h1 className="text-2xl font-semibold">
          {data.partner.channelName} 推广看板
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          分佣比例：{Number(data.partner.commissionRate) * 100}%
          &nbsp;|&nbsp; 状态：
          {data.partner.status === "active" ? "正常" : "暂停"}
        </p>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card/35 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Share2 className="size-4" /> 我的推广链接
        </h2>
        <div className="mt-3 rounded-xl border border-border/70 bg-background p-3">
          <p className="break-all text-sm">{inviteLink}</p>
        </div>
        <div className="mt-3 flex gap-2">
          <Button onClick={() => void copyLink()}>
            <Copy className="mr-2 size-4" /> 复制链接
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          {
            label: "本月预估",
            value: `¥${data.stats.monthEstimate.toLocaleString()}`,
            color: "text-emerald-400",
          },
          {
            label: "累计已结算",
            value: `¥${data.stats.totalPaid.toLocaleString()}`,
            color: "text-cyan-400",
          },
          {
            label: "累计应得",
            value: `¥${data.stats.totalEarned.toLocaleString()}`,
            color: "",
          },
          {
            label: "待审核",
            value: `¥${data.stats.pendingAmount.toLocaleString()}`,
            color: "text-amber-300",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-border/60 bg-card/30 p-4"
          >
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className={`mt-1 text-xl font-semibold ${card.color}`}>
              {card.value}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-border/70 bg-card/35 p-6">
        <div className="flex gap-4 border-b border-border/60 pb-3">
          <button
            type="button"
            className={`text-sm font-medium ${
              tab === "referrals" ? "text-cyan-300" : "text-muted-foreground"
            }`}
            onClick={() => setTab("referrals")}
          >
            引入学员 ({referrals.length})
          </button>
          <button
            type="button"
            className={`text-sm font-medium ${
              tab === "payouts" ? "text-cyan-300" : "text-muted-foreground"
            }`}
            onClick={() => setTab("payouts")}
          >
            结算记录 ({payouts.length})
          </button>
        </div>

        {tab === "referrals" && (
          <div className="mt-3 space-y-2">
            {referrals.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                暂无引入学员
              </p>
            ) : (
              referrals.map((r) => (
                <div
                  key={r.id}
                  className="rounded-lg border border-border/60 px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{r.studentName}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      学费: ¥{Number(r.tuitionAmount).toLocaleString()}
                    </span>
                    <span className="text-emerald-400">
                      佣金: +¥{Number(r.commissionAmount).toLocaleString()}
                    </span>
                    <span>
                      状态:{" "}
                      {r.commissionStatus === "paid"
                        ? "已结算"
                        : r.commissionStatus === "locked"
                          ? "已锁定"
                          : r.commissionStatus === "pending"
                            ? "待确认"
                            : "—"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "payouts" && (
          <div className="mt-3 space-y-2">
            {payouts.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                暂无结算记录
              </p>
            ) : (
              payouts.map((p) => (
                <div
                  key={String(p.id)}
                  className="rounded-lg border border-border/60 px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {String(p.settlement_month ?? "")}
                    </span>
                    <span className="font-medium text-emerald-400">
                      ¥{Number(p.total_commission).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    状态:{" "}
                    {p.status === "paid"
                      ? "已打款"
                      : p.status === "approved"
                        ? "已审核"
                        : p.status === "pending"
                          ? "待审核"
                          : "已取消"}
                    {p.paid_at
                      ? ` · ${new Date(String(p.paid_at)).toLocaleDateString()} 到账`
                      : ""}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      {error ? <p className="text-sm text-amber-300">{error}</p> : null}
    </main>
  );
}
