import type { SupabaseClient } from "@supabase/supabase-js";

import type { BillingCycle, PaidPlan } from "@/lib/billing/stripe";
import { fromBillingCycle, type MembershipPeriod } from "@/lib/membership/plans";
import { getCurrentMembership, syncLegacyMembershipAccount } from "@/lib/membership/v2";

type ActivateMembershipInput = {
  userId: string;
  plan: PaidPlan;
  period: MembershipPeriod;
  stripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
  cancelAtPeriodEnd?: boolean;
};

function addMonths(base: Date, months: number): Date {
  const next = new Date(base);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function periodToMonths(period: MembershipPeriod): number {
  return period === "yearly" ? 12 : 1;
}

export function cycleToPeriod(cycle: BillingCycle): MembershipPeriod {
  return fromBillingCycle(cycle);
}

export async function activateMembership(
  supabase: SupabaseClient,
  input: ActivateMembershipInput,
): Promise<void> {
  const now = new Date();
  const { data: currentRow } = await supabase
    .from("user_memberships")
    .select("current_period_end")
    .eq("user_id", input.userId)
    .maybeSingle();

  const currentEnd = currentRow?.current_period_end ? new Date(currentRow.current_period_end) : null;
  const base = currentEnd && currentEnd.getTime() > now.getTime() ? currentEnd : now;
  const periodEnd = addMonths(base, periodToMonths(input.period));
  const periodStart = base.getTime() > now.getTime() ? base : now;
  const billingCycle: BillingCycle = input.period === "yearly" ? "year" : "month";

  const { error: upsertError } = await supabase.from("user_memberships").upsert(
    {
      user_id: input.userId,
      plan: input.plan,
      status: "active",
      trial_end: null,
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: Boolean(input.cancelAtPeriodEnd),
      stripe_subscription_id: input.stripeSubscriptionId ?? null,
      stripe_customer_id: input.stripeCustomerId ?? null,
      billing_cycle: billingCycle,
    },
    { onConflict: "user_id" },
  );
  if (upsertError) {
    throw new Error(`[activateMembership] upsert failed: ${upsertError.message}`);
  }

  const current = await getCurrentMembership(supabase, input.userId);
  if (current) {
    await syncLegacyMembershipAccount(supabase, current);
  }
}
