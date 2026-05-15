import type { SupabaseClient } from "@supabase/supabase-js";

import { resolvePlanByPriceId } from "@/lib/billing/stripe";
import { activateMembership, cycleToPeriod } from "@/lib/membership/activate";
import { getCurrentMembership } from "@/lib/membership/v2";
import { getServiceSupabase } from "@/lib/supabase/service";

type StripeCustomerList = {
  data?: Array<{ id: string }>;
};

type StripeSubscription = {
  id: string;
  customer?: string | { id: string } | null;
  status?: string;
  cancel_at_period_end?: boolean;
  current_period_start?: number;
  current_period_end?: number;
  items?: {
    data?: Array<{
      price?: { id?: string | null };
    }>;
  };
  created?: number;
};

type StripeSubscriptionList = {
  data?: StripeSubscription[];
};

async function stripeGet<T>(path: string, secretKey: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
      signal: controller.signal,
    });
    const payload = (await res.json()) as { error?: { message?: string } } & T;
    if (!res.ok) {
      throw new Error(payload.error?.message ?? `stripe_request_failed_${res.status}`);
    }
    return payload;
  } finally {
    clearTimeout(timeoutId);
  }
}

function canActivateByStripeStatus(status: string | undefined): boolean {
  return status === "active" || status === "trialing" || status === "past_due" || status === "unpaid";
}

function toMembershipStatus(status: string | undefined): "active" | "paused" {
  return canActivateByStripeStatus(status) ? "active" : "paused";
}

function getCustomerId(sub: StripeSubscription): string | null {
  if (typeof sub.customer === "string") return sub.customer;
  if (sub.customer && typeof sub.customer === "object" && typeof sub.customer.id === "string") {
    return sub.customer.id;
  }
  return null;
}

function findActivatableSubscription(subscriptions: StripeSubscription[]): {
  subscription: StripeSubscription;
  period: "monthly" | "yearly";
  plan: "T1" | "T2" | "T3";
} | null {
  const sorted = [...subscriptions].sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  for (const sub of sorted) {
    if (!canActivateByStripeStatus(sub.status)) continue;
    const priceId = sub.items?.data?.[0]?.price?.id ?? null;
    if (!priceId) continue;
    const resolved = resolvePlanByPriceId(priceId);
    if (!resolved) continue;
    return {
      subscription: sub,
      period: cycleToPeriod(resolved.cycle),
      plan: resolved.plan,
    };
  }
  return null;
}

async function listSubscriptionsByCustomer(secretKey: string, customerId: string): Promise<StripeSubscription[]> {
  const subscriptions = await stripeGet<StripeSubscriptionList>(
    `subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=10`,
    secretKey,
  );
  return subscriptions.data ?? [];
}

async function listCustomersByEmail(secretKey: string, email: string): Promise<string[]> {
  const customers = await stripeGet<StripeCustomerList>(
    `customers?email=${encodeURIComponent(email)}&limit=10`,
    secretKey,
  );
  return (customers.data ?? []).map((c) => c.id);
}

export async function reconcileMembershipFromStripe(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return false;

  const writer = getServiceSupabase() ?? supabase;
  const current = await getCurrentMembership(writer, userId);
  if (!current) return false;
  if (current.plan === "T1" || current.plan === "T2" || current.plan === "T3") return false;

  const customerIdCandidates = new Set<string>();
  if (current.stripeCustomerId) customerIdCandidates.add(current.stripeCustomerId);

  try {
    const userResp = await supabase.auth.getUser();
    const email = userResp.data.user?.email?.trim().toLowerCase();
    if (email) {
      const customerIds = await listCustomersByEmail(secretKey, email);
      for (const id of customerIds) customerIdCandidates.add(id);
    }
  } catch {
    // fallback path: best effort only
  }

  for (const customerId of customerIdCandidates) {
    const subscriptions = await listSubscriptionsByCustomer(secretKey, customerId);
    const candidate = findActivatableSubscription(subscriptions);
    if (!candidate) continue;

    await activateMembership(writer, {
      userId,
      plan: candidate.plan,
      period: candidate.period,
      stripeSubscriptionId: candidate.subscription.id,
      stripeCustomerId: getCustomerId(candidate.subscription) ?? customerId,
      cancelAtPeriodEnd: Boolean(candidate.subscription.cancel_at_period_end),
    });

    if (candidate.subscription.current_period_start && candidate.subscription.current_period_end) {
      const { error } = await writer
        .from("user_memberships")
        .update({
          current_period_start: new Date(candidate.subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(candidate.subscription.current_period_end * 1000).toISOString(),
          status: toMembershipStatus(candidate.subscription.status),
          cancel_at_period_end: Boolean(candidate.subscription.cancel_at_period_end),
        })
        .eq("user_id", userId);
      if (error) {
        throw new Error(`[reconcileMembershipFromStripe] update period failed: ${error.message}`);
      }
    }
    return true;
  }

  return false;
}

