import { NextResponse } from "next/server";
import { z } from "zod";

import { getStripeClient } from "@/lib/billing/stripe";
import { ensureCurrentMembership } from "@/lib/membership/v2";
import { getStripePriceIdByPlan } from "@/lib/membership/plans";
import { requireSameOriginForMutation } from "@/lib/security/csrf";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

const bodySchema = z.object({
  plan: z.enum(["T1", "T2", "T3"]),
  period: z.enum(["monthly", "yearly"]).default("monthly"),
});

function resolveAppUrl(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function POST(request: Request) {
  const csrf = requireSameOriginForMutation(request);
  if (csrf) return csrf;

  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "参数错误" }, { status: 400 });
  }

  const membership = await ensureCurrentMembership(auth.supabase, auth.userId);
  if (!membership) {
    return NextResponse.json({ success: false, error: "会员信息不存在" }, { status: 404 });
  }

  const stripe = getStripeClient();
  const priceId = getStripePriceIdByPlan(parsed.data.plan, parsed.data.period);
  const appUrl = resolveAppUrl(request);

  const userResp = await auth.supabase.auth.getUser();
  const email = userResp.data.user?.email ?? undefined;

  const trialDaysLeft = membership.trialEnd
    ? Math.floor((new Date(membership.trialEnd).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : 0;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/membership?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/membership?canceled=true`,
    client_reference_id: auth.userId,
    customer: membership.stripeCustomerId ?? undefined,
    customer_email: membership.stripeCustomerId ? undefined : email,
    metadata: {
      userId: auth.userId,
      plan: parsed.data.plan,
      period: parsed.data.period,
    },
    subscription_data:
      trialDaysLeft > 0
        ? {
            trial_period_days: trialDaysLeft,
          }
        : undefined,
  });

  if (!session.url) {
    return NextResponse.json({ success: false, error: "未能创建结算会话" }, { status: 500 });
  }

  return NextResponse.json({ success: true, sessionUrl: session.url });
}
