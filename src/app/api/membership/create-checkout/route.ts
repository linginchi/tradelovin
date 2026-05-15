import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getStripeClient } from "@/lib/billing/stripe";
import { activateMembership } from "@/lib/membership/activate";
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
  if (configured) {
    try {
      const configuredUrl = new URL(configured);
      if (process.env.NODE_ENV === "production") {
        configuredUrl.protocol = "https:";
      }
      return configuredUrl.toString().replace(/\/$/, "");
    } catch {
      // ignore invalid configured URL and fallback to request URL
    }
  }
  const url = new URL(request.url);
  if (process.env.NODE_ENV === "production") {
    const forwardedProto = request.headers.get("x-forwarded-proto");
    if (forwardedProto === "https") {
      url.protocol = "https:";
    }
  }
  return `${url.protocol}//${url.host}`;
}

function normalizeStripeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    if (error.message.includes("Missing required env")) {
      const missing = error.message.replace("Missing required env:", "").trim();
      if (missing.includes("STRIPE_SECRET_KEY")) {
        return "支付配置缺失：未配置 STRIPE_SECRET_KEY（Cloudflare Worker Secret）";
      }
      return `支付配置缺失：缺少环境变量 ${missing}`;
    }
    return error.message;
  }
  return "创建支付会话失败，请稍后重试";
}

async function hasPaidVideoSubscription(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("course_registrations")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "paid")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[membership/create-checkout] paid video check failed", {
      userId,
      error: error.message,
    });
    return false;
  }
  return Boolean(data?.id);
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

  // If user already has paid video subscription entitlement, allow upgrade without extra charge.
  if (await hasPaidVideoSubscription(auth.supabase, auth.userId)) {
    await activateMembership(auth.supabase, {
      userId: auth.userId,
      plan: parsed.data.plan,
      period: parsed.data.period,
      stripeSubscriptionId: membership.stripeSubscriptionId,
      stripeCustomerId: membership.stripeCustomerId,
      cancelAtPeriodEnd: membership.cancelAtPeriodEnd,
    });
    return NextResponse.json({
      success: true,
      sessionUrl: null,
      freeUpgrade: true,
      message: "已检测到视频订阅，已为你免费升级。",
    });
  }

  try {
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
      console.error("[membership/create-checkout] stripe session missing url", {
        plan: parsed.data.plan,
        period: parsed.data.period,
        userId: auth.userId,
      });
      return NextResponse.json({ success: false, error: "未能创建结算会话" }, { status: 500 });
    }

    return NextResponse.json({ success: true, sessionUrl: session.url });
  } catch (error) {
    const message = normalizeStripeErrorMessage(error);
    console.error("[membership/create-checkout] failed", {
      userId: auth.userId,
      plan: parsed.data.plan,
      period: parsed.data.period,
      error,
    });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
