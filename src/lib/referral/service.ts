import { randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { earnPoints } from "@/lib/points/service";

function randomCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

export async function generateReferralCode(
  supabase: SupabaseClient,
  referrerId: string,
): Promise<{ code: string; referralId: string }> {
  // 优先复用未使用的邀请码，避免无限新增
  const { data: existing } = await supabase
    .from("referrals")
    .select("id,code")
    .eq("referrer_id", referrerId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);
  const reusable = (existing ?? []).find((x) => Boolean(x.id && x.code));
  if (reusable?.id && reusable.code) {
    return {
      code: String(reusable.code),
      referralId: String(reusable.id),
    };
  }

  let lastErrorMessage = "";
  for (let i = 0; i < 8; i += 1) {
    const code = randomCode();
    const { data, error } = await supabase
      .from("referrals")
      .insert({
        referrer_id: referrerId,
        referee_id: null,
        code,
        status: "pending",
      })
      .select("id,code")
      .single();
    if (!error && data?.id) {
      return { code: String(data.code), referralId: String(data.id) };
    }

    // 兼容已有 referee_id 非空约束的历史表结构：用 referrer_id 作为占位值
    const { data: data2, error: error2 } = await supabase
      .from("referrals")
      .insert({
        referrer_id: referrerId,
        referee_id: referrerId,
        code,
        status: "pending",
      })
      .select("id,code")
      .single();
    if (!error2 && data2?.id) {
      return { code: String(data2.code), referralId: String(data2.id) };
    }
    lastErrorMessage =
      (error2 as { message?: string } | null)?.message ??
      (error as { message?: string } | null)?.message ??
      lastErrorMessage;
  }
  throw new Error(lastErrorMessage ? `邀请码生成失败: ${lastErrorMessage}` : "邀请码生成失败");
}

export async function attachRefereeByCode(
  supabase: SupabaseClient,
  input: { code: string; refereeId: string },
): Promise<void> {
  const code = input.code.trim().toUpperCase();
  const { data: row } = await supabase
    .from("referrals")
    .select("id,referrer_id,referee_id,status")
    .eq("code", code)
    .maybeSingle();
  if (!row?.id || !row.referrer_id) return;
  if (row.referrer_id === input.refereeId) return;
  if (row.referee_id && row.referee_id !== row.referrer_id) return;

  // 检查 referrer 是否为 channel_partner（KOL）
  let partnerId: string | null = null;
  const { data: partnerRow } = await supabase
    .from("channel_partners")
    .select("id")
    .eq("user_id", row.referrer_id)
    .maybeSingle();
  if (partnerRow?.id) {
    partnerId = String(partnerRow.id);
  }

  const updateFields: Record<string, unknown> = {
    referee_id: input.refereeId,
    status: "completed_auth",
    completed_at: new Date().toISOString(),
  };
  if (partnerId) {
    updateFields.partner_id = partnerId;
  }

  await supabase
    .from("referrals")
    .update(updateFields)
    .eq("id", row.id);

  await earnPoints(supabase, {
    userId: String(row.referrer_id),
    reason: "referral_register",
    referenceId: String(row.id),
  });
}

function addDaysIso(baseIso: string, days: number): string {
  const base = new Date(baseIso).getTime();
  return new Date(base + days * 24 * 60 * 60 * 1000).toISOString();
}

async function extendMembership(
  supabase: SupabaseClient,
  input: { userId: string; plan: "T1" | "T2"; extraDays: number },
): Promise<void> {
  const { data: m } = await supabase
    .from("user_memberships")
    .select("current_period_end")
    .eq("user_id", input.userId)
    .maybeSingle();
  const nowIso = new Date().toISOString();
  const baseIso =
    m?.current_period_end && new Date(String(m.current_period_end)).getTime() > Date.now()
      ? String(m.current_period_end)
      : nowIso;
  const nextEnd = addDaysIso(baseIso, input.extraDays);

  await supabase
    .from("user_memberships")
    .update({
      plan: input.plan,
      status: "active",
      current_period_start: nowIso,
      current_period_end: nextEnd,
      cancel_at_period_end: false,
    })
    .eq("user_id", input.userId);
}

export async function settleReferralOnFirstPayment(
  supabase: SupabaseClient,
  input: { refereeId: string; paymentId?: string },
): Promise<void> {
  const { data: row } = await supabase
    .from("referrals")
    .select("id,referrer_id,referee_id,status,reward_granted")
    .eq("referee_id", input.refereeId)
    .in("status", ["completed_auth", "completed_payment"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!row?.id || !row.referrer_id) return;
  if (row.reward_granted) return;

  const { data: refMembership } = await supabase
    .from("user_memberships")
    .select("plan")
    .eq("user_id", row.referrer_id)
    .maybeSingle();

  const refPlan = String(refMembership?.plan ?? "T0_paid");
  if (refPlan === "T2") {
    await extendMembership(supabase, { userId: String(row.referrer_id), plan: "T2", extraDays: 15 });
  } else if (refPlan === "T3") {
    await extendMembership(supabase, { userId: String(row.referrer_id), plan: "T2", extraDays: 30 });
  } else {
    await extendMembership(supabase, { userId: String(row.referrer_id), plan: "T1", extraDays: 7 });
  }

  await earnPoints(supabase, {
    userId: String(row.referrer_id),
    reason: "referral_first_payment",
    referenceId: String(row.id),
  });

  const couponCode = `REF50-${randomBytes(3).toString("hex").toUpperCase()}`;
  await supabase.from("redemptions").insert({
    user_id: input.refereeId,
    reward_type: "referee_t1_50off",
    points_cost: 0,
    code: couponCode,
    status: "active",
    metadata: {
      discountPercent: 50,
      targetPlan: "T1",
      validMonths: 1,
    },
  });

  await supabase
    .from("referrals")
    .update({
      status: "completed_payment",
      reward_granted: true,
      completed_at: new Date().toISOString(),
    })
    .eq("id", row.id);
}
