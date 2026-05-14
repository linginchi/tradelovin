import Stripe from "stripe";

export type PaidPlan = "T1" | "T2" | "T3";
export type BillingCycle = "month" | "year";

type PriceMap = Record<PaidPlan, Record<BillingCycle, string>>;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function envAny(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  throw new Error(`Missing required env: ${names.join(" or ")}`);
}

export function getStripeClient(): Stripe {
  return new Stripe(env("STRIPE_SECRET_KEY"));
}

export function getStripePriceMap(): PriceMap {
  return {
    T1: {
      month: envAny("PRICE_T1_MONTHLY", "STRIPE_PRICE_T1_MONTHLY"),
      year: envAny("PRICE_T1_YEARLY", "STRIPE_PRICE_T1_YEARLY"),
    },
    T2: {
      month: envAny("PRICE_T2_MONTHLY", "STRIPE_PRICE_T2_MONTHLY"),
      year: envAny("PRICE_T2_YEARLY", "STRIPE_PRICE_T2_YEARLY"),
    },
    T3: {
      month: envAny("PRICE_T3_MONTHLY", "STRIPE_PRICE_T3_MONTHLY"),
      year: envAny("PRICE_T3_YEARLY", "STRIPE_PRICE_T3_YEARLY"),
    },
  };
}

export function getPriceId(plan: PaidPlan, cycle: BillingCycle): string {
  const map = getStripePriceMap();
  return map[plan][cycle];
}

export function resolvePlanByPriceId(priceId: string): { plan: PaidPlan; cycle: BillingCycle } | null {
  const map = getStripePriceMap();
  const entries = Object.entries(map) as Array<[PaidPlan, Record<BillingCycle, string>]>;
  for (const [plan, cycles] of entries) {
    if (cycles.month === priceId) return { plan, cycle: "month" };
    if (cycles.year === priceId) return { plan, cycle: "year" };
  }
  return null;
}
