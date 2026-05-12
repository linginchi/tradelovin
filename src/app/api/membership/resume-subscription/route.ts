import { NextResponse } from "next/server";

import { getStripeClient } from "@/lib/billing/stripe";
import { requireSameOriginForMutation } from "@/lib/security/csrf";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const csrf = requireSameOriginForMutation(request);
  if (csrf) return csrf;

  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;

  const { data: membership } = await auth.supabase
    .from("user_memberships")
    .select("stripe_subscription_id")
    .eq("user_id", auth.userId)
    .maybeSingle();

  const subscriptionId = membership?.stripe_subscription_id ?? null;
  if (!subscriptionId) {
    return NextResponse.json({ success: false, error: "未找到有效订阅" }, { status: 400 });
  }

  const stripe = getStripeClient();
  await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false });
  await auth.supabase
    .from("user_memberships")
    .update({ cancel_at_period_end: false })
    .eq("user_id", auth.userId);

  return NextResponse.json({ success: true });
}
