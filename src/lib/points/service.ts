import { randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

export type EarnReason =
  | "daily_login"
  | "sim_trade_completed"
  | "referral_register"
  | "referral_first_payment"
  | "course_purchase";

export type RedeemRewardType =
  | "membership_discount"
  | "course_voucher"
  | "t2_report_single_download";

type EarnRule = {
  amount: number;
  dailyLimitCount?: number;
};

const EARN_RULES: Record<EarnReason, EarnRule> = {
  daily_login: { amount: 5, dailyLimitCount: 1 },
  sim_trade_completed: { amount: 2, dailyLimitCount: 3 },
  referral_register: { amount: 50 },
  referral_first_payment: { amount: 100 },
  course_purchase: { amount: 0 },
};

export const REDEEM_RULES: Record<
  RedeemRewardType,
  { pointsCost: number; name: string; validityDays: number }
> = {
  membership_discount: { pointsCost: 200, name: "7天 P1 · 雪豹体验券", validityDays: 30 },
  course_voucher: { pointsCost: 300, name: "课程 9 折券", validityDays: 30 },
  t2_report_single_download: { pointsCost: 150, name: "P2 · 云豹报告单次下载券", validityDays: 30 },
};

function dayRangeUtc8(now = new Date()) {
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  const hkMs = utcMs + 8 * 3600 * 1000;
  const hk = new Date(hkMs);
  const y = hk.getUTCFullYear();
  const m = hk.getUTCMonth();
  const d = hk.getUTCDate();
  const startHk = Date.UTC(y, m, d, 0, 0, 0);
  const endHk = Date.UTC(y, m, d + 1, 0, 0, 0);
  return {
    startIso: new Date(startHk - 8 * 3600 * 1000).toISOString(),
    endIso: new Date(endHk - 8 * 3600 * 1000).toISOString(),
  };
}

export async function ensureUserPointsRow(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase
    .from("user_points")
    .upsert({ user_id: userId, balance: 0, total_earned: 0, total_spent: 0 }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

export async function getPointsSummary(supabase: SupabaseClient, userId: string) {
  await ensureUserPointsRow(supabase, userId);
  const [{ data: points }, { data: txs }, { data: redemptions }] = await Promise.all([
    supabase
      .from("user_points")
      .select("balance,total_earned,total_spent,updated_at")
      .eq("user_id", userId)
      .single(),
    supabase
      .from("points_transactions")
      .select("id,amount,type,reason,reference_id,metadata,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("redemptions")
      .select("id,reward_type,points_cost,code,status,metadata,created_at,used_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return {
    points: {
      balance: Number(points?.balance ?? 0),
      totalEarned: Number(points?.total_earned ?? 0),
      totalSpent: Number(points?.total_spent ?? 0),
      updatedAt: String(points?.updated_at ?? new Date().toISOString()),
    },
    transactions: txs ?? [],
    redemptions: redemptions ?? [],
  };
}

function buildRedeemCode(prefix: string): string {
  const token = randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}-${token}`;
}

export async function earnPoints(
  supabase: SupabaseClient,
  input: {
    userId: string;
    reason: EarnReason;
    referenceId?: string;
    amount?: number;
    metadata?: Record<string, unknown>;
  },
): Promise<{ applied: number; balance: number }> {
  await ensureUserPointsRow(supabase, input.userId);
  const rule = EARN_RULES[input.reason];
  let amount = rule.amount;
  if (input.reason === "course_purchase") {
    amount = Math.max(0, Math.trunc(Number(input.amount ?? 0)));
  }
  if (amount <= 0) {
    const { data: row } = await supabase.from("user_points").select("balance").eq("user_id", input.userId).single();
    return { applied: 0, balance: Number(row?.balance ?? 0) };
  }

  if (rule.dailyLimitCount && rule.dailyLimitCount > 0) {
    const range = dayRangeUtc8();
    const { count } = await supabase
      .from("points_transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", input.userId)
      .eq("type", "earn")
      .eq("reason", input.reason)
      .gte("created_at", range.startIso)
      .lt("created_at", range.endIso);
    if ((count ?? 0) >= rule.dailyLimitCount) {
      const { data: row } = await supabase.from("user_points").select("balance").eq("user_id", input.userId).single();
      return { applied: 0, balance: Number(row?.balance ?? 0) };
    }
  }

  if (input.referenceId) {
    const { data: existing } = await supabase
      .from("points_transactions")
      .select("id")
      .eq("user_id", input.userId)
      .eq("type", "earn")
      .eq("reason", input.reason)
      .eq("reference_id", input.referenceId)
      .maybeSingle();
    if (existing?.id) {
      const { data: row } = await supabase.from("user_points").select("balance").eq("user_id", input.userId).single();
      return { applied: 0, balance: Number(row?.balance ?? 0) };
    }
  }

  const { data: pointsRow } = await supabase
    .from("user_points")
    .select("balance,total_earned")
    .eq("user_id", input.userId)
    .single();
  const currentBalance = Number(pointsRow?.balance ?? 0);
  const nextBalance = currentBalance + amount;
  const totalEarned = Number(pointsRow?.total_earned ?? 0) + amount;

  const { error: updErr } = await supabase
    .from("user_points")
    .update({
      balance: nextBalance,
      total_earned: totalEarned,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", input.userId);
  if (updErr) throw new Error(updErr.message);

  const { error: txErr } = await supabase.from("points_transactions").insert({
    user_id: input.userId,
    amount,
    type: "earn",
    reason: input.reason,
    reference_id: input.referenceId ?? null,
    metadata: input.metadata ?? {},
  });
  if (txErr) throw new Error(txErr.message);

  return { applied: amount, balance: nextBalance };
}

export async function redeemPoints(
  supabase: SupabaseClient,
  input: { userId: string; rewardType: RedeemRewardType },
): Promise<{ code: string; pointsCost: number; balance: number }> {
  await ensureUserPointsRow(supabase, input.userId);
  const rule = REDEEM_RULES[input.rewardType];
  const { data: pointsRow } = await supabase
    .from("user_points")
    .select("balance,total_spent")
    .eq("user_id", input.userId)
    .single();
  const balance = Number(pointsRow?.balance ?? 0);
  if (balance < rule.pointsCost) {
    throw new Error("积分不足");
  }

  const nextBalance = balance - rule.pointsCost;
  const totalSpent = Number(pointsRow?.total_spent ?? 0) + rule.pointsCost;
  const code = buildRedeemCode("TLV");
  const expiresAt = new Date(Date.now() + rule.validityDays * 24 * 60 * 60 * 1000).toISOString();

  const { error: updErr } = await supabase
    .from("user_points")
    .update({
      balance: nextBalance,
      total_spent: totalSpent,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", input.userId);
  if (updErr) throw new Error(updErr.message);

  const { error: txErr } = await supabase.from("points_transactions").insert({
    user_id: input.userId,
    amount: -rule.pointsCost,
    type: "spend",
    reason: "redeem",
    reference_id: code,
    metadata: { rewardType: input.rewardType },
  });
  if (txErr) throw new Error(txErr.message);

  const { error: redeemErr } = await supabase.from("redemptions").insert({
    user_id: input.userId,
    reward_type: input.rewardType,
    points_cost: rule.pointsCost,
    code,
    status: "active",
    metadata: {
      name: rule.name,
      expiresAt,
    },
  });
  if (redeemErr) throw new Error(redeemErr.message);

  return { code, pointsCost: rule.pointsCost, balance: nextBalance };
}
