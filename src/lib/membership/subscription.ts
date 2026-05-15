import type { SupabaseClient } from "@supabase/supabase-js";

import type { BillingCycle, PaidPlan } from "@/lib/billing/stripe";
import { activateMembership } from "@/lib/membership/activate";
import { getCurrentMembership, syncLegacyMembershipAccount } from "@/lib/membership/v2";

export async function applyPaidMembershipFromStripe(
  supabase: SupabaseClient,
  input: {
    userId: string;
    plan: PaidPlan;
    cycle: BillingCycle;
    periodStart: number;
    periodEnd: number;
    stripeSubscriptionId: string;
    stripeCustomerId: string | null;
    cancelAtPeriodEnd?: boolean;
    status?: "active" | "paused" | "cancelled" | "expired" | "trialing";
  },
): Promise<void> {
  await activateMembership(supabase, {
    userId: input.userId,
    plan: input.plan,
    period: input.cycle === "year" ? "yearly" : "monthly",
    stripeSubscriptionId: input.stripeSubscriptionId,
    stripeCustomerId: input.stripeCustomerId,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd,
  });

  await supabase
    .from("user_memberships")
    .update({
      status: input.status ?? "active",
      current_period_start: new Date(input.periodStart * 1000).toISOString(),
      current_period_end: new Date(input.periodEnd * 1000).toISOString(),
      billing_cycle: input.cycle,
    })
    .eq("user_id", input.userId);

  const current = await getCurrentMembership(supabase, input.userId);
  if (current) {
    await syncLegacyMembershipAccount(supabase, current);
  }
}

export async function applyMembershipCancelAtPeriodEnd(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  await supabase
    .from("user_memberships")
    .update({ cancel_at_period_end: true, status: "active" })
    .eq("user_id", userId);

  const current = await getCurrentMembership(supabase, userId);
  if (current) {
    await syncLegacyMembershipAccount(supabase, current);
  }
}

export async function downgradeToT0Paid(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const nowIso = new Date().toISOString();
  await supabase
    .from("user_memberships")
    .update({
      plan: "T0_paid",
      status: "expired",
      cancel_at_period_end: false,
      stripe_subscription_id: null,
      grace_started_at: null,
      current_period_start: nowIso,
      current_period_end: nowIso,
    })
    .eq("user_id", userId);

  const current = await getCurrentMembership(supabase, userId);
  if (current) {
    await syncLegacyMembershipAccount(supabase, current);
  }
}
