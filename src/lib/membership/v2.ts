import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/service";

export type UserPlan = "T0_trial" | "T0_paid" | "T1" | "T2" | "T3";
export type MembershipStatus = "active" | "expired" | "cancelled" | "trialing" | "paused";

export type CurrentMembership = {
  id: string;
  userId: string;
  plan: UserPlan;
  status: MembershipStatus;
  trialEnd: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  billingCycle: "month" | "year" | null;
  graceStartedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function nowMs(): number {
  return Date.now();
}

function asDateMs(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  return new Date(value).getTime();
}

function normalizeStatus(row: {
  plan: UserPlan;
  status: MembershipStatus;
  trial_end: string | null;
  current_period_end: string;
}): MembershipStatus {
  const periodEndMs = asDateMs(row.current_period_end);
  const trialEndMs = asDateMs(row.trial_end);
  const n = nowMs();

  if (row.plan === "T0_trial") {
    return Number.isFinite(trialEndMs) && trialEndMs >= n ? "trialing" : "expired";
  }
  if (row.plan === "T0_paid") return "expired";
  if (row.status === "cancelled") return "cancelled";
  if (row.status === "paused") return "paused";
  if (Number.isFinite(periodEndMs) && periodEndMs < n) return "expired";
  return "active";
}

export function canUseSimTrading(membership: CurrentMembership): boolean {
  const n = nowMs();
  if (membership.plan === "T0_trial") {
    const trialEndMs = asDateMs(membership.trialEnd);
    return Number.isFinite(trialEndMs) && trialEndMs >= n;
  }
  if (membership.plan === "T0_paid") return false;
  const periodEndMs = asDateMs(membership.currentPeriodEnd);
  if (membership.plan === "T1" || membership.plan === "T2" || membership.plan === "T3") {
    return membership.status === "active" && Number.isFinite(periodEndMs) && periodEndMs >= n;
  }
  return false;
}

export function canUseTqReport(membership: CurrentMembership): boolean {
  if (membership.plan !== "T2" && membership.plan !== "T3") return false;
  const periodEndMs = asDateMs(membership.currentPeriodEnd);
  return membership.status === "active" && Number.isFinite(periodEndMs) && periodEndMs >= nowMs();
}

export async function getCurrentMembership(
  supabase: SupabaseClient,
  userId: string,
): Promise<CurrentMembership | null> {
  const { data, error } = await supabase
    .from("user_memberships")
    .select(
      "id,user_id,plan,status,trial_end,current_period_start,current_period_end,cancel_at_period_end,stripe_subscription_id,stripe_customer_id,billing_cycle,grace_started_at,created_at,updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const normalizedStatus = normalizeStatus({
    plan: data.plan as UserPlan,
    status: data.status as MembershipStatus,
    trial_end: data.trial_end as string | null,
    current_period_end: String(data.current_period_end),
  });

  if (normalizedStatus !== data.status) {
    await supabase
      .from("user_memberships")
      .update({ status: normalizedStatus })
      .eq("id", data.id);
  }

  return {
    id: String(data.id),
    userId: String(data.user_id),
    plan: data.plan as UserPlan,
    status: normalizedStatus,
    trialEnd: (data.trial_end as string | null) ?? null,
    currentPeriodStart: String(data.current_period_start),
    currentPeriodEnd: String(data.current_period_end),
    cancelAtPeriodEnd: Boolean(data.cancel_at_period_end),
    stripeSubscriptionId: (data.stripe_subscription_id as string | null) ?? null,
    stripeCustomerId: (data.stripe_customer_id as string | null) ?? null,
    billingCycle: (data.billing_cycle as "month" | "year" | null) ?? null,
    graceStartedAt: (data.grace_started_at as string | null) ?? null,
    createdAt: String(data.created_at),
    updatedAt: String(data.updated_at),
  };
}

export async function ensureCurrentMembership(
  supabase: SupabaseClient,
  userId: string,
): Promise<CurrentMembership | null> {
  let membership = await getCurrentMembership(supabase, userId);
  if (membership) return membership;

  const now = new Date();
  const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const payload = {
    user_id: userId,
    plan: "T0_trial" as const,
    status: "trialing" as const,
    trial_end: trialEnd,
    current_period_start: now.toISOString(),
    current_period_end: trialEnd,
  };
  const { error } = await supabase.from("user_memberships").insert(payload);
  if (error) {
    const srv = getServiceSupabase();
    if (srv) {
      await srv.from("user_memberships").upsert(payload, { onConflict: "user_id" });
    }
  }

  membership = await getCurrentMembership(supabase, userId);
  if (!membership) {
    const srv = getServiceSupabase();
    if (srv) {
      membership = await getCurrentMembership(srv, userId);
    }
  }
  return membership;
}

export async function syncLegacyMembershipAccount(
  supabase: SupabaseClient,
  membership: CurrentMembership,
): Promise<void> {
  let tier: "T1" | "T2" | "T3" = "T1";
  if (membership.plan === "T2") tier = "T2";
  if (membership.plan === "T3") tier = "T3";

  const payload = {
    user_id: membership.userId,
    tier,
    status:
      membership.plan === "T0_trial" && canUseSimTrading(membership)
        ? "trialing"
        : membership.status === "active"
          ? "active"
          : "expired",
    trial_start_at: membership.createdAt,
    trial_end_at: membership.trialEnd ?? membership.createdAt,
    current_period_start: membership.currentPeriodStart,
    current_period_end: membership.currentPeriodEnd,
    last_paid_at:
      membership.plan === "T1" || membership.plan === "T2" || membership.plan === "T3"
        ? membership.updatedAt
        : null,
  };

  const { error } = await supabase.from("membership_accounts").upsert(payload, { onConflict: "user_id" });
  if (error) {
    throw new Error(`[syncLegacyMembershipAccount] upsert failed: ${error.message}`);
  }
}
