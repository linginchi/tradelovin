import { NextResponse } from "next/server";
import { z } from "zod";

import { type BillingCycle, getPriceId, getStripeClient, type PaidPlan } from "@/lib/billing/stripe";
import { ensureCurrentMembership } from "@/lib/membership/v2";
import { requireSameOriginForMutation } from "@/lib/security/csrf";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

const bodySchema = z.object({
  plan: z.enum(["T1", "T2", "T3"]),
  paymentMethodId: z.string().optional(),
  isYearly: z.boolean().optional().default(false),
});

function getOriginFromRequest(request: Request): string {
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (origin) return origin.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function POST(request: Request) {
  const csrf = requireSameOriginForMutation(request);
  if (csrf) return csrf;

  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "请求体格式错误" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "参数错误" }, { status: 400 });
  }

  const membership = await ensureCurrentMembership(auth.supabase, auth.userId);
  if (!membership) {
    return NextResponse.json({ success: false, error: "会员信息不存在" }, { status: 404 });
  }

  const plan = parsed.data.plan as PaidPlan;
  const cycle: BillingCycle = parsed.data.isYearly ? "year" : "month";
  const stripe = getStripeClient();
  const priceId = getPriceId(plan, cycle);

  const userResp = await auth.supabase.auth.getUser();
  const email = userResp.data.user?.email ?? null;

  let customerId = membership.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: email ?? undefined,
      metadata: { userId: auth.userId },
    });
    customerId = customer.id;
    await auth.supabase
      .from("user_memberships")
      .update({ stripe_customer_id: customerId })
      .eq("user_id", auth.userId);
  }

  const origin = getOriginFromRequest(request);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/membership?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/membership?checkout=cancel`,
    metadata: {
      userId: auth.userId,
      plan,
      billingCycle: cycle,
      paymentMethodId: parsed.data.paymentMethodId ?? "",
    },
    allow_promotion_codes: true,
  });

  return NextResponse.json({
    success: true,
    data: {
      checkoutUrl: session.url,
      sessionId: session.id,
    },
  });
}
