import { NextResponse } from "next/server";
import { z } from "zod";

import { resolvePlanByPriceId } from "@/lib/billing/stripe";
import { activateMembership, cycleToPeriod } from "@/lib/membership/activate";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireSameOriginForMutation } from "@/lib/security/csrf";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

const bodySchema = z.object({
  sessionId: z.string().min(1),
});

function getStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Missing required env: STRIPE_SECRET_KEY");
  }
  return key;
}

type StripeCheckoutSession = {
  id: string;
  client_reference_id?: string | null;
  customer?: string | null;
  subscription?: string | null;
  payment_status?: string;
  status?: string | null;
};

type StripeSubscription = {
  id: string;
  cancel_at_period_end?: boolean;
  customer?: string | null;
  items?: {
    data?: Array<{
      price?: { id?: string | null };
    }>;
  };
};

async function stripeGet<T>(path: string, secretKey: string): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
    },
  });
  const payload = (await res.json()) as { error?: { message?: string } } & T;
  if (!res.ok) {
    throw new Error(payload.error?.message ?? `stripe_request_failed_${res.status}`);
  }
  return payload;
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

  try {
    const secretKey = getStripeSecretKey();
    const session = await stripeGet<StripeCheckoutSession>(`checkout/sessions/${parsed.data.sessionId}`, secretKey);

    if (session.client_reference_id !== auth.userId) {
      return NextResponse.json({ success: false, error: "会话归属不匹配" }, { status: 403 });
    }
    if (session.payment_status !== "paid" && session.status !== "complete") {
      return NextResponse.json({ success: false, error: "支付尚未完成，请稍后刷新。" }, { status: 409 });
    }
    const subscriptionId = session.subscription;
    if (!subscriptionId) {
      return NextResponse.json({ success: false, error: "未找到订阅信息" }, { status: 400 });
    }

    const subscription = await stripeGet<StripeSubscription>(`subscriptions/${subscriptionId}`, secretKey);
    const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
    if (!priceId) {
      return NextResponse.json({ success: false, error: "未找到价格信息" }, { status: 400 });
    }
    const resolved = resolvePlanByPriceId(priceId);
    if (!resolved) {
      return NextResponse.json({ success: false, error: "无法识别订阅档位" }, { status: 400 });
    }

    const writer = getServiceSupabase() ?? auth.supabase;
    await activateMembership(writer, {
      userId: auth.userId,
      plan: resolved.plan,
      period: cycleToPeriod(resolved.cycle),
      stripeSubscriptionId: subscription.id,
      stripeCustomerId:
        typeof subscription.customer === "string"
          ? subscription.customer
          : typeof session.customer === "string"
            ? session.customer
            : null,
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "同步会员状态失败";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

