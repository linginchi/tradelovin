import { NextResponse } from "next/server";

import { getStripeClient } from "@/lib/billing/stripe";
import { applyMembershipCancelAtPeriodEnd } from "@/lib/membership/subscription";
import { ensureCurrentMembership } from "@/lib/membership/v2";
import { requireSameOriginForMutation } from "@/lib/security/csrf";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const csrf = requireSameOriginForMutation(request);
  if (csrf) return csrf;

  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;

  const membership = await ensureCurrentMembership(auth.supabase, auth.userId);
  if (!membership) {
    return NextResponse.json({ success: false, error: "会员信息不存在" }, { status: 404 });
  }
  if (!membership.stripeSubscriptionId) {
    return NextResponse.json({ success: false, error: "未找到可取消的订阅" }, { status: 400 });
  }

  const stripe = getStripeClient();
  await stripe.subscriptions.update(membership.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  await applyMembershipCancelAtPeriodEnd(auth.supabase, auth.userId);
  const refreshed = await ensureCurrentMembership(auth.supabase, auth.userId);

  return NextResponse.json({
    success: true,
    data: refreshed,
  });
}
